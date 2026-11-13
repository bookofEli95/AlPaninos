"use client";

import { useEffect, useState } from "react";
import { Loader2, Tag, X } from "lucide-react";
import { browserSupabase } from "@/lib/browser-supabase";
import { cart, type CartState } from "@/lib/cart";
import { appliedPromoFromRow, promoValue, type PromoRow } from "@/lib/ordering/promo";
import { money } from "@/lib/format";

// A typed code (a deal's, or a friend's referral code for accounts), the
// applied one with what it's doing right now, and the deals on offer to
// apply with a click.
export default function PromoBox({
  c,
  discount,
  unmetReason,
  userId,
  isMember,
}: {
  c: CartState;
  discount: number;
  unmetReason: string | null;
  userId: string | null;
  isMember: boolean;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offers, setOffers] = useState<PromoRow[]>([]);

  useEffect(() => {
    if (!c.storeId) return;
    let cancelled = false;
    browserSupabase()
      .from("promotions")
      .select("*")
      .eq("is_active", true)
      .or(`location_id.eq.${c.storeId},location_id.is.null`)
      .then(({ data }) => {
        if (cancelled || !data) return;
        // Free-item rewards are claimed in the app (they need an item picked).
        setOffers((data as PromoRow[]).filter((p) => Number(p.discount_percent ?? 0) < 100 && (!p.expires_at || Date.parse(p.expires_at) > Date.now())));
      });
    return () => {
      cancelled = true;
    };
  }, [c.storeId, userId]);

  const apply = async (row: PromoRow) => {
    if (row.single_use !== false && userId) {
      const { count } = await browserSupabase().from("orders").select("id", { count: "exact", head: true }).eq("user_id", userId).ilike("promo_code", row.code);
      if ((count ?? 0) > 0) throw new Error("You've already used this code.");
    }
    cart.setPromo(appliedPromoFromRow(row));
    setCode("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const typed = code.trim();
    if (!typed) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = browserSupabase();
      const { data, error: findError } = await supabase.from("promotions").select("*").ilike("code", typed).eq("is_active", true).maybeSingle();
      if (findError) throw findError;
      let row = data as PromoRow | null;
      // Not a deal's code: maybe a friend's (Give $5, Get $5) -- accounts only.
      if (!row && isMember) {
        const { data: friend, error: friendError } = await supabase.rpc("redeem_referral_code", { p_code: typed });
        if (friendError) throw new Error(friendError.message.replace(/ \(on the Profile tab\)| from the Profile tab/g, ""));
        row = (friend as PromoRow) ?? null;
      }
      if (!row) throw new Error("That code doesn't exist or is no longer active.");
      if (Number(row.discount_percent ?? 0) >= 100) throw new Error("That's a free-item reward. Claim it in the Al Panino's app.");
      await apply(row);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't apply that code.");
    } finally {
      setBusy(false);
    }
  };

  const others = offers.filter((o) => o.code.toLowerCase() !== c.promo?.code.toLowerCase()).slice(0, 4);

  return (
    <div>
      {c.promo ? (
        <div className={`flex items-start gap-3 rounded-xl p-4 ring-1 ${discount > 0 ? "bg-emerald-50 ring-emerald-200" : "bg-amber-50 ring-amber-200"}`}>
          <Tag className={`mt-0.5 size-5 shrink-0 ${discount > 0 ? "text-emerald-700" : "text-amber-700"}`} aria-hidden />
          <div className="flex-1">
            <p className="text-[15px] font-bold text-ink">
              {c.promo.title} <span className="ml-1 rounded bg-white/70 px-1.5 py-0.5 font-mono text-[12px] text-stone-600">{c.promo.code}</span>
            </p>
            <p className={`mt-0.5 text-[14px] ${discount > 0 ? "text-emerald-800" : "text-amber-900"}`}>{discount > 0 ? `You're saving ${money(discount)}.` : unmetReason}</p>
          </div>
          <button type="button" onClick={() => cart.setPromo(null)} className="rounded-md p-1 text-stone-500 hover:bg-white/60 hover:text-ink" aria-label="Remove deal">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex gap-2">
          <label className="flex-1">
            <span className="sr-only">Promo code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Promo or friend code"
              autoCapitalize="characters"
              className="w-full rounded-lg border border-stone-300 bg-white px-3.5 py-3 font-mono text-[15px] uppercase tracking-wide outline-none placeholder:font-sans placeholder:normal-case placeholder:tracking-normal focus:border-brand focus:ring-4 focus:ring-brand/10"
            />
          </label>
          <button type="submit" disabled={busy || !code.trim()} className="inline-flex min-w-24 items-center justify-center rounded-lg bg-ink px-5 text-[14px] font-extrabold uppercase tracking-wide text-white hover:bg-black disabled:opacity-40">
            {busy ? <Loader2 className="size-4 animate-spin" aria-label="Applying" /> : "Apply"}
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-[14px] font-medium text-brand" role="alert">{error}</p>}

      {others.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{c.promo ? "Or swap for" : "Deals you can use"}</p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {others.map((o) => {
              const applied = appliedPromoFromRow(o);
              return (
                <li key={o.code}>
                  <button
                    type="button"
                    onClick={() => apply(o).catch((err) => setError(err.message))}
                    className="group flex w-full items-center gap-3 rounded-xl border border-dashed border-stone-300 bg-white p-3 text-left transition hover:border-brand"
                  >
                    <span className="shrink-0 rounded-md bg-brand px-2 py-1.5 text-center text-[11px] font-extrabold leading-tight text-white">{promoValue(applied)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold text-ink">{o.title}</span>
                      <span className="block text-[12px] font-semibold uppercase tracking-wide text-brand group-hover:underline">Apply</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
