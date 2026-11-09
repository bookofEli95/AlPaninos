"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChefHat, Clock, Loader2, LifeBuoy, MapPin, Navigation, PackageCheck, Phone, ReceiptText, Sparkles, Truck, XCircle } from "lucide-react";
import { browserSupabase, useSession } from "@/lib/browser-supabase";
import KeepPointsCard from "@/components/account/keep-points-card";
import { clockTime, etaLine, formatDayAndTime } from "@/lib/ordering/timing";
import { pointsForSubtotal } from "@/lib/ordering/points";
import { optionSummary } from "@/components/ordering/cart-lines";
import { money } from "@/lib/format";

type Order = {
  id: string;
  created_at: string;
  status: string;
  order_type: "pickup" | "delivery";
  delivery_address: string | null;
  requested_ready_at: string | null;
  estimated_ready_at: string | null;
  ready_at: string | null;
  out_for_delivery_at: string | null;
  completed_at: string | null;
  customer_name: string | null;
  subtotal_amount: number;
  discount_amount: number | null;
  tax_amount: number;
  total_amount: number;
  promo_code: string | null;
  is_catering: boolean;
  locations: { name: string; address: string | null; phone: string | null; latitude: number | null; longitude: number | null } | null;
  order_items: {
    id: string;
    quantity: number;
    total_price: number;
    special_instructions: string | null;
    menu_items: { name: string; per_person?: boolean | null } | null;
    order_item_modifiers: { modifier_options: { name: string } | null }[];
  }[];
};

const SELECT = `*, locations ( name, address, phone, latitude, longitude ),
  order_items ( id, quantity, total_price, special_instructions, menu_items ( * ), order_item_modifiers ( modifier_options ( name ) ) )`;

const PICKUP_STEPS = [
  { key: "received", label: "Received", Icon: ReceiptText },
  { key: "preparing", label: "In the Press", Icon: ChefHat },
  { key: "ready", label: "Ready for Pickup", Icon: PackageCheck },
  { key: "completed", label: "Picked Up", Icon: Check },
];
const DELIVERY_STEPS = [
  { key: "received", label: "Received", Icon: ReceiptText },
  { key: "preparing", label: "Preparing", Icon: ChefHat },
  { key: "out_for_delivery", label: "On the Way", Icon: Truck },
  { key: "completed", label: "Delivered", Icon: Check },
];

function statusLine(o: Order): string {
  switch (o.status) {
    case "received":
      return "Got it! Your order's in line for the press.";
    case "preparing":
      return "It's in the press, getting its grill marks.";
    case "ready":
      return o.ready_at ? `Hot off the press and wrapped at the counter since ${clockTime(o.ready_at)}.` : "Hot off the press and wrapped at the counter.";
    case "out_for_delivery":
      return o.out_for_delivery_at ? `Wrapped up and on its way. It left the shop at ${clockTime(o.out_for_delivery_at)}.` : "Wrapped up and on its way to you.";
    case "completed":
      return "Enjoy, and thanks for ordering from Al Paninos!";
    default:
      return "";
  }
}

// A burst of confetti in the brand colours, once, when the order's placed.
function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        left: (i * 37) % 100,
        delay: (i % 10) * 0.12,
        duration: 2.4 + ((i * 13) % 10) / 6,
        color: ["#a61c14", "#ffc72c", "#f4ece1", "#ffe58a", "#d0261b"][i % 5],
        drift: `${((i * 29) % 40) - 20}vw`,
        spin: `${360 + ((i * 47) % 540)}deg`,
        size: 6 + (i % 4) * 2,
      })),
    []
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-[65] overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 rounded-[2px]"
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 1.6,
              background: p.color,
              animation: `confetti-fall ${p.duration}s cubic-bezier(0.2,0.6,0.4,1) ${p.delay}s forwards`,
              "--drift": p.drift,
              "--spin": p.spin,
              transform: "translateY(-20vh)",
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

export default function OrderTracker({ id, placed: justPlaced }: { id: string; placed: boolean }) {
  const { ready, user, isMember } = useSession();
  // The celebration is once: the "?placed=1" comes off the address (without
  // reloading), so a refresh just shows the order.
  const [placed] = useState(justPlaced);
  useEffect(() => {
    if (justPlaced) window.history.replaceState(null, "", `/order/${id}`);
  }, [justPlaced, id]);
  const [order, setOrder] = useState<Order | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    const { data, error } = await browserSupabase().from("orders").select(SELECT).eq("id", id).maybeSingle();
    if (error || !data) {
      setState("missing");
      return;
    }
    setOrder(data as Order);
    setState("ok");
  }, [id]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      // Nothing to read it with: signed out.
      queueMicrotask(() => setState("missing"));
      return;
    }
    queueMicrotask(load);
  }, [ready, user, load]);

  // Live: database changes as they happen, a check every 20 seconds as a
  // backstop, and the ETA's minutes ticking down.
  const final = order?.status === "completed" || order?.status === "cancelled";
  useEffect(() => {
    if (!user || final) return;
    const supabase = browserSupabase();
    const channel = supabase
      .channel(`order-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` }, () => load())
      .subscribe();
    const poll = setInterval(load, 20000);
    const tick = setInterval(() => setTick((t) => t + 1), 30000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [user, id, final, load]);

  if (state === "loading" || !ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-7 animate-spin text-brand" aria-label="Loading your order" />
      </div>
    );
  }
  if (state === "missing" || !order) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
        <ReceiptText className="size-10 text-brand" aria-hidden />
        <h1 className="mt-4 font-display text-3xl font-extrabold text-ink">We can&apos;t show this order</h1>
        <p className="mt-2 text-stone-500">Orders are private. Sign in with the account (or email) you ordered with to see it.</p>
        <div className="mt-7 flex gap-3">
          <Link href={`/signin?next=/order/${id}`} className="rounded-lg bg-brand px-6 py-3.5 text-[14px] font-extrabold uppercase tracking-wide text-white hover:bg-brand-dark">
            Sign In
          </Link>
          <Link href="/menu" className="rounded-lg px-6 py-3.5 text-[14px] font-extrabold uppercase tracking-wide text-ink ring-1 ring-stone-300 hover:bg-white">
            Menu
          </Link>
        </div>
      </div>
    );
  }

  const steps = order.order_type === "delivery" ? DELIVERY_STEPS : PICKUP_STEPS;
  const cancelled = order.status === "cancelled";
  const at = Math.max(0, steps.findIndex((s) => s.key === order.status));
  const eta = etaLine(order);
  const store = order.locations;
  const points = pointsForSubtotal(Number(order.subtotal_amount));
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const providers = (user?.app_metadata?.providers as string[] | undefined) ?? [];
  const passwordless = isMember && !meta.has_password && !meta.first_name && !providers.some((p) => p === "google" || p === "apple");
  const shortId = order.id.slice(0, 8).toUpperCase();
  const directions = store?.latitude != null && store.longitude != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${store.latitude},${store.longitude}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${store?.name ?? ""} ${store?.address ?? ""}`)}`;

  return (
    <>
      {placed && <Confetti />}
      <section className="grain bg-ink text-white">
        <div className="mx-auto max-w-5xl px-4 pb-12 pt-10 sm:px-6 sm:pt-14">
          <p className="text-[13px] font-bold uppercase tracking-[0.16em] text-gold">
            {placed ? "Order placed" : order.is_catering ? "Catering order" : "Your order"} · #{shortId}
          </p>
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
            {cancelled
              ? "This order was cancelled"
              : order.status === "completed"
              ? "Enjoy!"
              : placed && order.status === "received"
              ? `Thanks${order.customer_name ? `, ${order.customer_name.split(" ")[0]}` : ""}! We've got it.`
              : steps[at].label}
          </h1>
          {!cancelled && (
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[17px] text-stone-300">
              {eta && (
                <span className="inline-flex items-center gap-2 font-bold text-white">
                  <Clock className="size-5 text-gold" aria-hidden />
                  {eta}
                </span>
              )}
              <span>{statusLine(order)}</span>
            </p>
          )}

          {!cancelled && (
            <ol className="mt-10 grid grid-cols-4 gap-2" aria-label="Order progress">
              {steps.map((step, i) => {
                const done = i < at || order.status === "completed";
                const current = i === at && order.status !== "completed";
                return (
                  <li key={step.key} className="relative" aria-current={current ? "step" : undefined}>
                    <div className={`h-1.5 rounded-full ${done || current ? "bg-gold" : "bg-white/15"} ${current ? "animate-pulse" : ""}`} />
                    <div className="mt-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center">
                      <span
                        className={`flex size-9 shrink-0 items-center justify-center rounded-full ${done ? "bg-gold text-ink" : current ? "bg-brand text-white" : "bg-white/10 text-stone-400"}`}
                        style={current ? { animation: "pulse-ring 1.6s ease-out infinite" } : undefined}
                      >
                        <step.Icon className="size-[18px]" aria-hidden />
                      </span>
                      <span className={`text-[13px] font-bold leading-tight sm:text-[14px] ${done || current ? "text-white" : "text-stone-500"}`}>{step.label}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {cancelled && (
            <p className="mt-4 flex items-center gap-2 text-stone-300">
              <XCircle className="size-5 text-blush" aria-hidden />
              If you weren&apos;t expecting this, the store will be happy to help.
            </p>
          )}
        </div>
      </section>

      <div className="bg-cream">
        <div className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            {passwordless && !cancelled && <KeepPointsCard points={points} />}

            <section className="rounded-2xl bg-white p-6 ring-1 ring-stone-200">
              <h2 className="font-display text-xl font-extrabold text-ink">Receipt</h2>
              <p className="mt-1 text-[14px] text-stone-500">
                Placed {formatDayAndTime(new Date(order.created_at))}
                {order.requested_ready_at ? ` · for ${formatDayAndTime(new Date(order.requested_ready_at))}` : ""}
              </p>
              <ul className="mt-4 divide-y divide-stone-200">
                {order.order_items.map((line) => {
                  const summary = optionSummary(line.order_item_modifiers.map((m) => ({ name: m.modifier_options?.name ?? "" })).filter((m) => m.name));
                  return (
                    <li key={line.id} className="flex justify-between gap-4 py-3">
                      <div>
                        <p className="font-bold text-ink">
                          {line.quantity > 1 && !line.menu_items?.per_person && <span className="text-brand">{line.quantity}× </span>}
                          {line.menu_items?.name}
                        </p>
                        {line.menu_items?.per_person && (
                          <p className="text-[13px] font-bold text-ink">
                            For {line.quantity} {line.quantity === 1 ? "person" : "people"}
                          </p>
                        )}
                        {summary && <p className="text-[13px] text-stone-500">{summary}</p>}
                        {line.special_instructions && <p className="text-[13px] italic text-stone-500">&ldquo;{line.special_instructions}&rdquo;</p>}
                      </div>
                      <p className="font-semibold tabular-nums text-ink">{money(line.total_price)}</p>
                    </li>
                  );
                })}
              </ul>
              <dl className="mt-2 space-y-1.5 border-t border-stone-200 pt-4 text-[15px]">
                <div className="flex justify-between">
                  <dt className="text-stone-600">Subtotal</dt>
                  <dd className="tabular-nums">{money(order.subtotal_amount)}</dd>
                </div>
                {Number(order.discount_amount) > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <dt>Deal{order.promo_code ? ` (${order.promo_code})` : ""}</dt>
                    <dd className="tabular-nums">−{money(order.discount_amount)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-stone-600">HST</dt>
                  <dd className="tabular-nums">{money(order.tax_amount)}</dd>
                </div>
                <div className="flex justify-between border-t border-stone-200 pt-3 text-lg font-extrabold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{money(order.total_amount)}</dd>
                </div>
              </dl>
              {isMember && !passwordless && !cancelled && (
                <p className="mt-4 flex items-center gap-2 rounded-lg bg-cream p-3 text-[14px] text-ink">
                  <Sparkles className="size-4 text-brand" aria-hidden />
                  {order.status === "completed" ? `${points} PaninoPoints added to your account.` : `${points} PaninoPoints land in your account once it's ${order.order_type === "delivery" ? "delivered" : "picked up"}.`}
                </p>
              )}
            </section>
          </div>

          <aside className="space-y-4">
            {store && (
              <section className="rounded-2xl bg-white p-6 ring-1 ring-stone-200">
                <h2 className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-stone-500">{order.order_type === "delivery" ? "Delivering from" : "Pick up at"}</h2>
                <p className="mt-2 font-display text-xl font-extrabold text-ink">{store.name}</p>
                {store.address && (
                  <p className="mt-1 flex items-start gap-1.5 text-[14px] text-stone-600">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                    {store.address}
                  </p>
                )}
                {order.order_type === "delivery" && order.delivery_address && (
                  <p className="mt-3 rounded-lg bg-cream p-3 text-[14px] text-ink">
                    <span className="block text-[12px] font-bold uppercase tracking-wide text-stone-500">Delivering to</span>
                    {order.delivery_address}
                  </p>
                )}
                <div className="mt-4 grid gap-2">
                  {store.phone && (
                    <a href={`tel:${store.phone.replace(/[^0-9+]/g, "")}`} className="flex items-center justify-center gap-2 rounded-lg py-3 text-[14px] font-bold text-ink ring-1 ring-stone-300 hover:bg-cream">
                      <Phone className="size-4" aria-hidden />
                      Call {store.phone}
                    </a>
                  )}
                  {order.order_type === "pickup" && (
                    <a href={directions} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-lg bg-ink py-3 text-[14px] font-bold text-white hover:bg-black">
                      <Navigation className="size-4" aria-hidden />
                      Directions
                    </a>
                  )}
                </div>
              </section>
            )}
            <Link href={`/support?order=${order.id}`} className="flex items-center gap-3 rounded-2xl bg-white p-5 ring-1 ring-stone-200 transition hover:ring-brand">
              <LifeBuoy className="size-6 text-brand" aria-hidden />
              <span>
                <span className="block font-bold text-ink">Problem with this order?</span>
                <span className="block text-[14px] text-stone-500">Get help from the team</span>
              </span>
            </Link>
            <Link href="/menu" className="block rounded-lg bg-brand py-4 text-center text-[14px] font-extrabold uppercase tracking-wide text-white hover:bg-brand-dark">
              Order Something Else
            </Link>
          </aside>
        </div>
      </div>
    </>
  );
}
