"use client";

import { useEffect, useState } from "react";
import { browserSupabase, useSession } from "@/lib/browser-supabase";

// The deal codes this customer has already used on an order (lower-case),
// read off their own orders -- as the app's useUsedPromoCodes. A one-time
// deal (promotions.single_use, the default) disappears once it's been used;
// the database refuses it a second time anyway (place_order).
export function useUsedDealCodes(): Set<string> {
  const { ready, user } = useSession();
  const userId = ready ? (user?.id ?? null) : null;
  const [used, setUsed] = useState<{ userId: string; codes: Set<string> } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    browserSupabase()
      .from("orders")
      .select("promo_code")
      .eq("user_id", userId)
      .not("promo_code", "is", null)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setUsed({ userId, codes: new Set(data.map((o: { promo_code: string }) => String(o.promo_code).toLowerCase())) });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return used && used.userId === userId ? used.codes : EMPTY;
}

const EMPTY = new Set<string>();

export const isDealUsed = (deal: { code?: string | null; single_use?: boolean | null }, used: Set<string>) =>
  deal.single_use !== false && !!deal.code && used.has(deal.code.toLowerCase());
