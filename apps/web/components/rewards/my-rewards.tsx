"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Gift, Loader2, Lock, X } from "lucide-react";
import FoodPhoto from "@/components/food-photo";
import { useModal } from "@/components/ordering/use-modal";
import { useOrdering, type Reward } from "@/components/ordering/ordering-provider";
import { browserSupabase, useSession } from "@/lib/browser-supabase";
import { getCart, useCart } from "@/lib/cart";
import { REWARD_TIERS } from "@/lib/ordering/points";
import { money } from "@/lib/format";

// The database's names for the tiers (redeem_points_reward).
const TIER_KEYS: Record<number, string> = { 150: "dip", 300: "beverage", 600: "specialty_side", 1200: "sandwich" };

type Prize = { code: string; title: string; category_name: string; item_name_patterns: string[] | null; expires_at: string | null };
type Choice = { id: string; name: string; base_price: number; image_url: string | null };

// Choose the free item for a reward: what it covers at the order's store.
function RewardPicker({ prize, onClose }: { prize: Prize; onClose: () => void }) {
  const ref = useModal(true, onClose);
  const { openItem } = useOrdering();
  const [items, setItems] = useState<Choice[] | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = browserSupabase();
      let storeId = getCart().storeId;
      if (!storeId) {
        const { data } = await supabase.from("locations").select("id").order("name").limit(1);
        storeId = data?.[0]?.id ?? null;
      }
      if (!storeId) return setItems([]);
      const { data: cats } = await supabase.from("menu_categories").select("id, name").eq("location_id", storeId);
      const cat = (cats ?? []).find((c) => c.name.trim().toLowerCase() === prize.category_name.trim().toLowerCase());
      if (!cat) return setItems([]);
      const { data } = await supabase.from("menu_items").select("id, name, base_price, image_url").eq("category_id", cat.id).eq("is_available", true).order("name");
      const patterns = (prize.item_name_patterns ?? []).map((p) => p.trim().toLowerCase());
      setItems(((data ?? []) as Choice[]).filter((i) => !patterns.length || patterns.includes(i.name.trim().toLowerCase())));
    })();
  }, [prize]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/60 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Choose your ${prize.title}`} className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white outline-none sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4 bg-ink px-6 py-5 text-white">
          <div>
            <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-gold">{prize.title}</p>
            <h2 className="mt-1 font-display text-2xl font-extrabold">Pick your free item</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-stone-300 hover:bg-white/10" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-5">
          {!items && <Loader2 className="mx-auto my-10 size-7 animate-spin text-brand" aria-label="Loading" />}
          {items?.length === 0 && <p className="py-10 text-center text-stone-500">Nothing this reward covers is available at this store right now.</p>}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items?.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    openItem(i.id, undefined, { code: prize.code, title: prize.title });
                  }}
                  className="group block w-full overflow-hidden rounded-xl text-left ring-1 ring-stone-200 transition hover:ring-brand"
                >
                  <FoodPhoto src={i.image_url} alt="" sizes="220px" className="aspect-[4/3] w-full" />
                  <span className="block p-3">
                    <span className="block font-bold text-ink">{i.name}</span>
                    <span className="text-[13px]">
                      <span className="text-stone-400 line-through">{money(i.base_price)}</span> <span className="font-extrabold text-emerald-700">FREE</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// PaninoPoints for a signed-in member: redeem a tier for its free item,
// and every reward they hold (points, the welcome spin, a birthday treat)
// ready to add to the order.
export default function MyRewards() {
  const { ready, isMember, user } = useSession();
  const c = useCart();
  const [points, setPoints] = useState<number | null>(null);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<Prize | null>(null);

  const load = useCallback(async (userId: string) => {
    const supabase = browserSupabase();
    const [p, r] = await Promise.all([
      supabase.from("profiles").select("panino_points").eq("id", userId).single(),
      supabase.from("promotions").select("code, title, category_name, item_name_patterns, expires_at").eq("user_id", userId).eq("is_active", true).eq("discount_percent", 100),
    ]);
    setPoints(p.data?.panino_points ?? 0);
    setPrizes(((r.data ?? []) as Prize[]).filter((x) => x.category_name && (!x.expires_at || Date.parse(x.expires_at) > Date.now())));
  }, []);

  useEffect(() => {
    if (ready && isMember && user) queueMicrotask(() => load(user.id));
  }, [ready, isMember, user, load]);

  if (!ready) return null;
  if (!isMember) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-2xl bg-ink p-7 text-white sm:flex-row sm:items-center sm:justify-between">
        <p className="text-lg">
          <strong>Already a member?</strong> Sign in to see your points and redeem rewards right here.
        </p>
        <div className="flex gap-3">
          <Link href="/signin?next=/rewards" className="rounded-lg bg-white px-5 py-3 text-[14px] font-extrabold uppercase tracking-wide text-ink">
            Sign In
          </Link>
          <Link href="/join" className="rounded-lg bg-gold px-5 py-3 text-[14px] font-extrabold uppercase tracking-wide text-ink">
            Join Free
          </Link>
        </div>
      </div>
    );
  }

  const redeem = async (cost: number) => {
    setError(null);
    setBusy(cost);
    const { data, error: rpcError } = await browserSupabase().rpc("redeem_points_reward", { p_tier: TIER_KEYS[cost] });
    setBusy(null);
    if (rpcError) return setError(rpcError.message === "Not enough points" ? "You don't have enough points for that one yet." : rpcError.message);
    await load(user!.id);
    const tier = REWARD_TIERS.find((t) => t.cost === cost)!;
    const reward: Reward = { code: data.code, title: data.title ?? tier.title };
    const { data: prize } = await browserSupabase().from("promotions").select("code, title, category_name, item_name_patterns, expires_at").eq("code", reward.code).single();
    if (prize) setPicking(prize as Prize);
  };

  const inOrder = new Set(c.lines.map((l) => l.rewardCode).filter(Boolean));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl bg-ink p-7 text-white">
        <div>
          <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-stone-400">Your balance</p>
          <p className="mt-1 font-display text-5xl font-extrabold tabular-nums">{points === null ? "..." : points.toLocaleString()}</p>
        </div>
        <p className="max-w-sm text-[15px] text-stone-300">Redeem below, then pick your free item. It goes straight into your order.</p>
      </div>

      {prizes.length > 0 && (
        <div>
          <h3 className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-stone-500">Ready to use</h3>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {prizes.map((p) => (
              <li key={p.code} className="flex items-center gap-4 rounded-xl bg-white p-4 ring-2 ring-brand">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                  <Gift className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-ink">{p.title}</span>
                  <span className="block text-[13px] text-stone-500">{inOrder.has(p.code) ? "In your order" : "Choose your item"}</span>
                </span>
                {inOrder.has(p.code) ? (
                  <Check className="size-5 text-emerald-600" aria-label="In your order" />
                ) : (
                  <button type="button" onClick={() => setPicking(p)} className="rounded-lg bg-brand px-4 py-2.5 text-[13px] font-extrabold uppercase tracking-wide text-white hover:bg-brand-dark">
                    Add to Order
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {REWARD_TIERS.map((t) => {
          const can = (points ?? 0) >= t.cost;
          return (
            <li key={t.cost} className={`flex flex-col rounded-2xl border-2 border-dashed bg-white p-5 ${can ? "border-brand" : "border-stone-200"}`}>
              <p className="font-display text-3xl font-extrabold tabular-nums text-brand">{t.cost.toLocaleString()}</p>
              <p className="text-[12px] font-bold uppercase tracking-wide text-stone-500">points</p>
              <p className="mt-3 flex-1 border-t border-stone-200 pt-3 font-bold text-ink">{t.title}</p>
              <button
                type="button"
                onClick={() => redeem(t.cost)}
                disabled={!can || busy !== null}
                className="mt-4 flex items-center justify-center gap-1.5 rounded-lg bg-brand py-2.5 text-[13px] font-extrabold uppercase tracking-wide text-white hover:bg-brand-dark disabled:bg-stone-200 disabled:text-stone-500"
              >
                {busy === t.cost ? <Loader2 className="size-4 animate-spin" aria-hidden /> : !can && <Lock className="size-3.5" aria-hidden />}
                {can ? "Redeem" : `${(t.cost - (points ?? 0)).toLocaleString()} to go`}
              </button>
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="text-[14px] font-medium text-brand" role="alert">
          {error}
        </p>
      )}
      {picking && <RewardPicker prize={picking} onClose={() => setPicking(null)} />}
    </div>
  );
}
