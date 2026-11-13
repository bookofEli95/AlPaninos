import { supabase } from './supabase';

// Paying online by card in the app (the online_payments migration and the
// pay-order Edge Function -- the same as the website's lib/payments.ts).
//
// The card boxes are the website's own (its /pay/card page, shown in a web
// view), so the app and the website always use the same secure card form.
// Card payments show at checkout only when both are on:
//   - EXPO_PUBLIC_WEBSITE_URL, where that page lives
//   - the store's own switch: locations.online_payments
// Otherwise it's pay at the store (or, for catering, by invoice), as before.

export type PayMethod = 'online' | 'in_store' | 'invoice';

export const WEBSITE_URL = (process.env.EXPO_PUBLIC_WEBSITE_URL ?? '').replace(/\/+$/, '');

// Whether this store takes cards online. Read on its own, so a database
// without the switch yet just means "no".
export async function fetchOnlinePayments(locationId: string): Promise<boolean> {
  if (!WEBSITE_URL) return false;
  const { data, error } = await (supabase as any).from('locations').select('online_payments').eq('id', locationId).maybeSingle();
  return !error && !!data?.online_payments;
}

// Tips: a share of the order before tax, or an amount of their own.
export const TIP_PERCENTS = [10, 15, 18, 20] as const;
export type TipChoice = { kind: 'none' } | { kind: 'percent'; percent: number } | { kind: 'custom'; amount: string };

const round2 = (x: number) => Math.round(x * 100) / 100;

export function tipAmount(choice: TipChoice, beforeTax: number): number {
  if (choice.kind === 'percent') return round2((beforeTax * choice.percent) / 100);
  if (choice.kind === 'custom') {
    const n = Number(choice.amount.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) && n > 0 ? round2(n) : 0;
  }
  return 0;
}

// What the charge step answered (functions/pay-order).
export type PayResult = {
  status: 'paid' | 'declined' | 'unknown' | 'busy' | 'unavailable' | 'error';
  message?: string;
};

export async function payOrder(orderId: string, token: string): Promise<PayResult> {
  const { data, error } = await supabase.functions.invoke('pay-order', { body: { order_id: orderId, token } });
  if (error) {
    let message: string | undefined;
    try {
      message = (await (error as any).context?.json())?.message;
    } catch {
      // No readable answer.
    }
    return { status: 'error', message: message ?? "We couldn't reach the payment service. Please try again." };
  }
  return data as PayResult;
}

// ---- an order's payment, for the order screens ----
export type OrderPayment = {
  order_type?: string | null;
  total_amount: number;
  // Missing on orders read before the payments update reached the database.
  tip_amount?: number | null;
  payment_method?: string | null;
  payment_status?: string | null;
  card_summary?: string | null;
};

export const orderGrandTotal = (o: Pick<OrderPayment, 'total_amount' | 'tip_amount'>) =>
  round2(Number(o.total_amount) + Number(o.tip_amount ?? 0));

export function paymentNote(o: OrderPayment): string {
  if (o.payment_status === 'paid') return `Paid by card${o.card_summary ? ` (${o.card_summary})` : ''}.`;
  if (o.payment_status === 'charging') return "We're checking your card payment. Please don't pay again. The store will confirm it.";
  if (o.payment_status === 'refunded') return 'Refunded to your card.';
  if (o.payment_method === 'invoice') return "We'll email your invoice after we confirm with you by phone.";
  if (Number(o.total_amount) === 0) return 'Nothing to pay on this order.';
  const total = `$${orderGrandTotal(o).toFixed(2)}`;
  return o.order_type === 'delivery' ? `You'll pay ${total} when it's delivered.` : `You'll pay ${total} when you pick it up.`;
}
