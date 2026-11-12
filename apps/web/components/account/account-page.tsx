"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Copy, Loader2, LogOut, RotateCcw, Sparkles, UserRound } from "lucide-react";
import KeepPointsCard from "./keep-points-card";
import MyRewards from "@/components/rewards/my-rewards";
import { useOrdering } from "@/components/ordering/ordering-provider";
import { browserSupabase, useSession } from "@/lib/browser-supabase";
import { cart, cateringCart, getCart } from "@/lib/cart";
import { linesFromOrder } from "@/lib/ordering/reorder";
import { pointsProgress } from "@/lib/ordering/points";
import { COUNTRIES, DEFAULT_COUNTRY, formatPhoneNumber, isValidPhoneForCountry, parsePhone, type Country } from "@/lib/ordering/countries";
import { formatDayAndTime } from "@/lib/ordering/timing";
import { money } from "@/lib/format";

type Profile = { first_name: string | null; last_name: string | null; phone: string | null; notify_email: boolean; notify_sms: boolean; panino_points: number };
type PastOrder = {
  id: string;
  created_at: string;
  status: string;
  order_type: string;
  total_amount: number;
  is_catering: boolean;
  locations: { name: string } | null;
  order_items: { quantity: number; menu_items: { name: string; per_person?: boolean | null } | null }[];
};

const STATUS: Record<string, { label: string; tone: string }> = {
  received: { label: "Received", tone: "bg-amber-100 text-amber-900" },
  preparing: { label: "Preparing", tone: "bg-amber-100 text-amber-900" },
  ready: { label: "Ready", tone: "bg-emerald-100 text-emerald-800" },
  out_for_delivery: { label: "On the way", tone: "bg-sky-100 text-sky-900" },
  completed: { label: "Completed", tone: "bg-stone-100 text-stone-700" },
  cancelled: { label: "Cancelled", tone: "bg-red-100 text-red-800" },
};

const input = "mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3.5 py-3 text-[15px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/10";
const label = "text-xs font-bold uppercase tracking-wide text-stone-500";

export default function AccountPage() {
  const router = useRouter();
  const { ready, user, isMember } = useSession();
  const { notify, openCart } = useOrdering();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orders, setOrders] = useState<PastOrder[] | null>(null);
  const [referral, setReferral] = useState<{ code: string; friends_joined: number; friends_ordered: number } | null>(null);
  const [reordering, setReordering] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Profile form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifySms, setNotifySms] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async (userId: string) => {
    const supabase = browserSupabase();
    const [p, o, r] = await Promise.all([
      supabase.from("profiles").select("first_name, last_name, phone, notify_email, notify_sms, panino_points").eq("id", userId).single(),
      supabase
        .from("orders")
        .select("id, created_at, status, order_type, total_amount, is_catering, locations ( name ), order_items ( quantity, menu_items ( * ) )")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(12),
      supabase.rpc("get_my_referral"),
    ]);
    if (p.data) {
      const prof = p.data as Profile;
      setProfile(prof);
      setFirstName(prof.first_name ?? "");
      setLastName(prof.last_name ?? "");
      const parsed = parsePhone(prof.phone ?? "");
      setCountry(parsed.country);
      setPhone(parsed.digits);
      setNotifyEmail(prof.notify_email);
      setNotifySms(prof.notify_sms);
    }
    setOrders((o.data as unknown as PastOrder[]) ?? []);
    if (r.data) setReferral(r.data);
  }, []);

  useEffect(() => {
    if (ready && !isMember) router.replace("/signin?next=/account");
    if (ready && isMember && user) queueMicrotask(() => load(user.id));
  }, [ready, isMember, user, router, load]);

  const orderAgain = async (orderId: string) => {
    setReordering(orderId);
    try {
      const { store, lines, skipped } = await linesFromOrder(orderId);
      if (!lines.length) {
        notify("Those items aren't on the menu anymore.");
        return;
      }
      // A catering order goes back on the catering form, ready to send.
      if (lines.every((l) => l.perPerson)) {
        if (cateringCart.get().lines.length && !window.confirm("Replace the catering order you've started with this one?")) return;
        cateringCart.cart.reset({ storeId: store.id, storeName: store.name, lines: [] });
        lines.forEach((line) => cateringCart.cart.append(line, store));
        notify(skipped.length ? `${skipped.join(", ")} ${skipped.length === 1 ? "isn't" : "aren't"} available anymore. The rest is ready.` : "Your catering order is ready to send.");
        router.push("/catering#spread");
        return;
      }
      const current = getCart();
      if (current.lines.length && current.storeId !== store.id && !window.confirm(`Your current order is from ${current.storeName}. Replace it with this order from ${store.name}?`)) return;
      lines.forEach((line) => cart.add(line, store));
      notify(skipped.length ? `Added to your order. ${skipped.join(", ")} ${skipped.length === 1 ? "isn't" : "aren't"} available anymore.` : "Added to your order.", {
        label: "View Order",
        onClick: openCart,
      });
      openCart();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Couldn't load that order.");
    } finally {
      setReordering(null);
    }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(null);
    if (!firstName.trim() || !lastName.trim()) return setSaved("Enter your first and last name.");
    if (!isValidPhoneForCountry(phone, country)) return setSaved(`Enter a valid phone number for ${country.name}.`);
    if (!notifyEmail && !notifySms) return setSaved("Choose at least one way to get order updates.");
    setSaving(true);
    const { error } = await browserSupabase()
      .from("profiles")
      .update({ first_name: firstName.trim(), last_name: lastName.trim(), phone: `+${country.dialCode}${phone}`, notify_email: notifyEmail, notify_sms: notifySms })
      .eq("id", user!.id);
    setSaving(false);
    setSaved(error ? error.message : "Saved.");
  };

  if (!ready || !isMember || !profile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-7 animate-spin text-brand" aria-label="Loading your account" />
      </div>
    );
  }

  const points = profile.panino_points ?? 0;
  const { next, ratio } = pointsProgress(points);
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const providers = (user?.app_metadata?.providers as string[] | undefined) ?? [];
  const passwordless = !meta.has_password && !meta.first_name && !providers.some((p) => p === "google" || p === "apple");

  return (
    <>
      <section className="grain bg-ink text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_420px] lg:items-end lg:py-16">
          <div>
            <p className="text-[13px] font-bold font-accent uppercase tracking-[0.16em] text-gold">My Account</p>
            <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Hi, {profile.first_name || "there"}!</h1>
            <p className="mt-2 text-stone-400">{user?.email}</p>
          </div>
          <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
            <p className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.14em] text-stone-400">
              <Sparkles className="size-4 text-gold" aria-hidden />
              PaninoPoints
            </p>
            <p className="mt-2 font-display text-5xl font-extrabold tabular-nums">{points.toLocaleString()}</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${Math.max(4, ratio * 100)}%` }} />
            </div>
            <p className="mt-2 text-[14px] text-stone-300">{next ? `${(next.cost - points).toLocaleString()} more for ${next.one}` : "You've unlocked every reward. Treat yourself!"}</p>
          </div>
        </div>
      </section>

      <div className="bg-cream">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            {passwordless && <KeepPointsCard />}

            {/* Orders */}
            <section className="rounded-2xl bg-white p-6 ring-1 ring-stone-200">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl font-extrabold text-ink">Your orders</h2>
                <Link href="/menu" className="text-[14px] font-bold text-brand hover:underline">
                  Start a new order
                </Link>
              </div>
              {orders && orders.length === 0 && <p className="mt-4 text-stone-500">No orders yet. Your first one earns points straight away.</p>}
              <ul className="mt-4 divide-y divide-stone-200">
                {(orders ?? []).map((o) => {
                  const status = STATUS[o.status] ?? { label: o.status, tone: "bg-stone-100 text-stone-700" };
                  const names = o.order_items
                    .map((i) => (i.menu_items?.per_person ? `${i.menu_items.name} for ${i.quantity}` : `${i.quantity > 1 ? `${i.quantity}× ` : ""}${i.menu_items?.name ?? "Item"}`))
                    .join(", ");
                  return (
                    <li key={o.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
                      <Link href={`/order/${o.id}`} className="group min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-ink group-hover:text-brand">{formatDayAndTime(new Date(o.created_at)).replace(/^at /, "Today at ")}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold ${status.tone}`}>{status.label}</span>
                          {o.is_catering && <span className="rounded-full bg-ink px-2 py-0.5 text-[12px] font-bold text-white">Catering</span>}
                        </span>
                        <span className="mt-0.5 block truncate text-[14px] text-stone-500">{names}</span>
                        <span className="mt-0.5 block text-[13px] text-stone-400">
                          {o.order_type === "delivery" ? "Delivery" : "Pickup"} · {o.locations?.name} · {money(o.total_amount)}
                        </span>
                      </Link>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => orderAgain(o.id)}
                          disabled={reordering === o.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-[13px] font-extrabold uppercase tracking-wide text-white hover:bg-brand-dark disabled:opacity-60"
                        >
                          {reordering === o.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />}
                          Order Again
                        </button>
                        <Link href={`/order/${o.id}`} className="inline-flex items-center rounded-lg px-3 text-stone-500 ring-1 ring-stone-300 hover:text-ink" aria-label="View order">
                          <ChevronRight className="size-4" />
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Rewards */}
            <section className="rounded-2xl bg-white p-6 ring-1 ring-stone-200">
              <h2 className="font-display text-2xl font-extrabold text-ink">Rewards</h2>
              <div className="mt-5">
                <MyRewards />
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            {referral?.code && (
              <section className="rounded-2xl bg-brand p-6 text-white">
                <p className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-gold">Give $5, get $5</p>
                <h2 className="mt-2 font-display text-2xl font-extrabold">Share your code</h2>
                <p className="mt-1.5 text-[15px] text-white/85">Friends get $5 off their first order of $15+. You get $5 when they order.</p>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(referral.code);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch {}
                  }}
                  className="mt-4 flex w-full items-center justify-between rounded-lg bg-white px-4 py-3 font-mono text-lg font-bold tracking-widest text-ink"
                >
                  {referral.code}
                  <span className="flex items-center gap-1 font-sans text-[13px] font-bold tracking-normal text-brand">
                    {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                    {copied ? "Copied" : "Copy"}
                  </span>
                </button>
                <p className="mt-3 text-[13px] text-white/75">
                  {referral.friends_joined} joined · {referral.friends_ordered} ordered
                </p>
              </section>
            )}

            <form onSubmit={saveProfile} className="rounded-2xl bg-white p-6 ring-1 ring-stone-200">
              <h2 className="flex items-center gap-2 font-display text-xl font-extrabold text-ink">
                <UserRound className="size-5 text-brand" aria-hidden />
                Your details
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <label className="block">
                  <span className={label}>First name</span>
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" className={input} />
                </label>
                <label className="block">
                  <span className={label}>Last name</span>
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" className={input} />
                </label>
              </div>
              <div className="mt-4">
                <span className={label}>Mobile number</span>
                <div className="mt-1.5 flex gap-2">
                  <select
                    value={country.code}
                    onChange={(e) => setCountry(COUNTRIES.find((x) => x.code === e.target.value) ?? DEFAULT_COUNTRY)}
                    aria-label="Country code"
                    className="w-28 rounded-lg border border-stone-300 bg-white px-2 text-[15px] outline-none focus:border-brand"
                  >
                    {COUNTRIES.map((x) => (
                      <option key={x.code} value={x.code}>
                        {x.flag} +{x.dialCode}
                      </option>
                    ))}
                  </select>
                  <input
                    value={formatPhoneNumber(phone, country)}
                    onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, "").slice(0, country.maxLength))}
                    inputMode="tel"
                    aria-label="Mobile number"
                    className="w-full rounded-lg border border-stone-300 bg-white px-3.5 py-3 text-[15px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
                  />
                </div>
              </div>
              <fieldset className="mt-4">
                <legend className={label}>Order updates</legend>
                <div className="mt-2 space-y-2">
                  {(
                    [
                      ["Email", notifyEmail, setNotifyEmail],
                      ["Text message", notifySms, setNotifySms],
                    ] as const
                  ).map(([name, on, set]) => (
                    <label key={name} className="flex cursor-pointer items-center gap-2.5">
                      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="size-4 accent-[#a61c14]" />
                      <span className="text-[15px] text-ink">{name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <button type="submit" disabled={saving} className="mt-5 w-full rounded-lg bg-ink py-3.5 text-[14px] font-extrabold uppercase tracking-wide text-white hover:bg-black disabled:opacity-60">
                {saving ? "Saving..." : "Save Details"}
              </button>
              {saved && <p className={`mt-2 text-[14px] ${saved === "Saved." ? "text-emerald-700" : "text-brand"}`}>{saved}</p>}
            </form>

            <section className="rounded-2xl bg-white p-6 ring-1 ring-stone-200">
              <button
                type="button"
                onClick={async () => {
                  await browserSupabase().auth.signOut();
                  router.replace("/");
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg py-3 text-[14px] font-bold text-ink ring-1 ring-stone-300 hover:bg-cream"
              >
                <LogOut className="size-4" aria-hidden />
                Sign Out
              </button>
              <p className="mt-4 text-center text-[13px] text-stone-500">
                Want your account deleted?{" "}
                <Link href="/support" className="font-semibold underline">
                  Contact us
                </Link>
                .
              </p>
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}
