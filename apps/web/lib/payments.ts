"use client";

import { useEffect, useState } from "react";
import { browserSupabase } from "./browser-supabase";
import { round2 } from "./cart";

// Paying online by card (the online_payments migration and the pay-order
// Edge Function). Card payments show at checkout only when both are on:
//   - the website's card company: NEXT_PUBLIC_PAYMENTS_PROVIDER
//     ("test" for pretend payments while testing; "clover" once linked)
//   - the store's own switch: locations.online_payments
// Otherwise it's pay at the store (or, for catering, by invoice), as before.

export type PaymentProvider = "test";
export type PayMethod = "online" | "in_store" | "invoice";

export function paymentProvider(): PaymentProvider | null {
  return process.env.NEXT_PUBLIC_PAYMENTS_PROVIDER === "test" ? "test" : null;
}

// Whether this store takes cards online. Read on its own, so a database
// without the switch yet just means "no".
export function useOnlinePayments(storeId: string | null): boolean {
  const [on, setOn] = useState<{ storeId: string; on: boolean } | null>(null);
  useEffect(() => {
    if (!storeId || !paymentProvider()) return;
    let cancelled = false;
    browserSupabase()
      .from("locations")
      .select("online_payments")
      .eq("id", storeId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!cancelled) setOn({ storeId, on: !error && !!(data as { online_payments?: boolean } | null)?.online_payments });
      });
    return () => {
      cancelled = true;
    };
  }, [storeId]);
  return !!paymentProvider() && on?.storeId === storeId && on.on;
}

// Tips: a share of the order before tax, or an amount of their own.
export const TIP_PERCENTS = [10, 15, 18, 20] as const;
export type TipChoice = { kind: "none" } | { kind: "percent"; percent: number } | { kind: "custom"; amount: string };

export function tipAmount(choice: TipChoice, beforeTax: number): number {
  if (choice.kind === "percent") return round2((beforeTax * choice.percent) / 100);
  if (choice.kind === "custom") {
    const n = Number(choice.amount.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) && n > 0 ? round2(n) : 0;
  }
  return 0;
}

// What the charge step answered (functions/pay-order).
export type PayResult = { status: "paid" | "declined" | "unknown" | "busy" | "unavailable" | "error"; message?: string };

export async function payOrder(orderId: string, token: string): Promise<PayResult> {
  const { data, error } = await browserSupabase().functions.invoke("pay-order", { body: { order_id: orderId, token } });
  if (error) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    return { status: "error", message: body?.message ?? "We couldn't reach the payment service. Please try again." };
  }
  return data as PayResult;
}

// ---- an order's payment, for the order page, account and store screen ----
export type OrderPayment = {
  order_type: "pickup" | "delivery";
  total_amount: number;
  // Missing on orders read before the payments update reached the database.
  tip_amount?: number | null;
  payment_method?: string | null;
  payment_status?: string | null;
  card_summary?: string | null;
};

// What the customer pays in all: the order plus any tip.
export const orderGrandTotal = (o: Pick<OrderPayment, "total_amount" | "tip_amount">) => round2(Number(o.total_amount) + Number(o.tip_amount ?? 0));

export type PaymentState = "paid" | "checking" | "refunded" | "invoice" | "free" | "at_store";

export function paymentState(o: OrderPayment): PaymentState {
  if (o.payment_status === "paid") return "paid";
  if (o.payment_status === "charging") return "checking";
  if (o.payment_status === "refunded") return "refunded";
  if (o.payment_method === "invoice") return "invoice";
  if (Number(o.total_amount) === 0) return "free";
  return "at_store";
}
