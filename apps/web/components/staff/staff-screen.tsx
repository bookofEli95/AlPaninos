"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BellRing, ChefHat, Check, Loader2, LogOut, PackageCheck, Phone, Printer, Store, Truck, Volume2, VolumeX, Wifi, WifiOff, X } from "lucide-react";
import { browserSupabase, useSession } from "@/lib/browser-supabase";
import { playChime, unlockSound } from "@/lib/staff/chime";
import { clockTime, formatDayAndTime, storeDayStart } from "@/lib/ordering/timing";
import { money, prettyPhone } from "@/lib/format";

type Line = {
  id: string;
  quantity: number;
  special_instructions: string | null;
  // per_person: a catering package where the quantity is the headcount.
  menu_items: { name: string; per_person?: boolean | null } | null;
  order_item_modifiers: { modifier_options: { name: string; modifier_groups: { name: string } | null } | null }[];
};
type Order = {
  id: string;
  created_at: string;
  status: "received" | "preparing" | "ready" | "out_for_delivery" | "completed" | "cancelled";
  order_type: "pickup" | "delivery";
  delivery_address: string | null;
  requested_ready_at: string | null;
  estimated_ready_at: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  total_amount: number;
  discount_amount: number | null;
  promo_code: string | null;
  is_catering: boolean;
  catering_company: string | null;
  catering_notes: string | null;
  catering_confirmed_at: string | null;
  po_number: string | null;
  invoice_email: string | null;
  order_items: Line[];
};
type StoreRow = { id: string; name: string };

const SELECT = `id, created_at, status, order_type, delivery_address, requested_ready_at, estimated_ready_at, customer_name, customer_phone,
  total_amount, discount_amount, promo_code, is_catering, catering_company, catering_notes, catering_confirmed_at, po_number, invoice_email,
  order_items ( id, quantity, special_instructions, menu_items ( * ), order_item_modifiers ( modifier_options ( name, modifier_groups!group_id ( name ) ) ) )`;

const ACTIVE = ["received", "preparing", "ready", "out_for_delivery"] as const;
// An order due further out than this is "Later" (scheduled, catering),
// not something to start now.
const LATER_MINUTES = 60;

const due = (o: Order) => new Date(o.requested_ready_at ?? o.estimated_ready_at ?? o.created_at);
const shortId = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;
const readKey = (key: string) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeKey = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {}
};

// ---- Sign in (staff accounts only) ---------------------------------------

function StaffSignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink px-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const { error: signInError } = await browserSupabase().auth.signInWithPassword({ email: email.trim(), password });
          setBusy(false);
          if (signInError) setError(/invalid login/i.test(signInError.message) ? "That email and password don't match." : signInError.message);
        }}
        className="w-full max-w-sm rounded-2xl bg-white p-7"
      >
        <p className="text-[13px] font-extrabold font-accent uppercase tracking-[0.16em] text-brand">Al Panino&apos;s</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold text-ink">Store orders</h1>
        <p className="mt-1 text-[15px] text-stone-600">Sign in with a staff account.</p>
        <label className="mt-6 block">
          <span className="text-xs font-bold uppercase tracking-wide text-stone-600">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" className="mt-1.5 w-full rounded-lg border border-stone-300 px-3.5 py-3 text-[16px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/10" />
        </label>
        <label className="mt-4 block">
          <span className="text-xs font-bold uppercase tracking-wide text-stone-600">Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="mt-1.5 w-full rounded-lg border border-stone-300 px-3.5 py-3 text-[16px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/10" />
        </label>
        {error && (
          <p className="mt-3 text-[14px] font-medium text-brand" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-4 text-[15px] font-extrabold uppercase tracking-wide text-white disabled:opacity-60">
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Sign In
        </button>
      </form>
    </div>
  );
}

// ---- One order -------------------------------------------------------------

function OrderCard({
  order,
  now,
  later,
  acknowledged,
  onAcknowledge,
  onStatus,
  onConfirmCatering,
  onPrint,
}: {
  order: Order;
  now: number;
  later: boolean;
  acknowledged: boolean;
  onAcknowledge: () => void;
  onStatus: (status: Order["status"]) => Promise<void>;
  onConfirmCatering: () => Promise<void>;
  onPrint: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const delivery = order.order_type === "delivery";
  const dueAt = due(order);
  const minsToDue = Math.round((dueAt.getTime() - now) / 60000);
  const late = !later && minsToDue < 0 && order.status !== "ready" && order.status !== "out_for_delivery";
  const fresh = order.status === "received" && !acknowledged;
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const next: { label: string; status: Order["status"]; Icon: typeof ChefHat } | null =
    order.status === "received"
      ? { label: "Start", status: "preparing", Icon: ChefHat }
      : order.status === "preparing"
      ? delivery
        ? { label: "Out for Delivery", status: "out_for_delivery", Icon: Truck }
        : { label: "Ready for Pickup", status: "ready", Icon: PackageCheck }
      : order.status === "ready" || order.status === "out_for_delivery"
      ? { label: delivery ? "Delivered" : "Picked Up", status: "completed", Icon: Check }
      : null;

  return (
    // New: a pulsing red glow around the card (on a wrapper, so it doesn't
    // replace the card's own outline), the text staying solid.
    <div className="rounded-2xl" style={fresh ? { animation: "pulse-ring 1.4s ease-out infinite" } : undefined}>
      <article className={`overflow-hidden rounded-2xl bg-white shadow-sm ring-2 transition ${fresh ? "ring-brand" : late ? "ring-red-500" : "ring-stone-200"}`}>
        <header className={`flex items-start justify-between gap-3 px-4 py-3 ${fresh ? "bg-brand text-white" : "bg-stone-100 text-ink"}`}>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-display text-xl font-extrabold">{order.customer_name || "Guest"}</span>
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide ${delivery ? "bg-sky-600 text-white" : "bg-ink text-white"}`}>
                {delivery ? "Delivery" : "Pickup"}
              </span>
              {order.is_catering && <span className="rounded bg-gold px-1.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-ink">Catering</span>}
              {fresh && <span className="rounded bg-white px-1.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-brand">New</span>}
            </p>
            <p className={`mt-0.5 text-[13px] ${fresh ? "text-white/85" : "text-stone-600"}`}>
              {shortId(order.id)} · placed {clockTime(order.created_at)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className={`text-[12px] font-bold uppercase tracking-wide ${fresh ? "text-white/80" : "text-stone-500"}`}>{order.requested_ready_at ? "Wanted" : "Due"}</p>
            <p className={`font-display text-xl font-extrabold tabular-nums ${late ? "text-red-600" : ""}`}>
              {later ? formatDayAndTime(dueAt).replace(/^at /, "") : clockTime(dueAt.toISOString())}
            </p>
            {!later && order.status !== "completed" && order.status !== "cancelled" && (
              <p className={`text-[12px] font-bold ${late ? "text-red-600" : fresh ? "text-white/85" : "text-stone-500"}`}>{minsToDue >= 0 ? `in ${minsToDue} min` : `${-minsToDue} min late`}</p>
            )}
          </div>
        </header>

        <div className="px-4 py-3">
          <ul className="space-y-2">
            {order.order_items.map((line) => {
              const counts = new Map<string, number>();
              line.order_item_modifiers.forEach((m) => m.modifier_options && counts.set(m.modifier_options.name, (counts.get(m.modifier_options.name) ?? 0) + 1));
              return (
                <li key={line.id}>
                  <p className="text-[17px] font-bold leading-snug text-ink">
                    <span className="mr-1.5 inline-flex min-w-7 justify-center rounded bg-ink px-1.5 text-white tabular-nums">{line.quantity}</span>
                    {line.menu_items?.name ?? "Item"}
                    {line.menu_items?.per_person && <span className="text-brand"> · for {line.quantity} people</span>}
                  </p>
                  {counts.size > 0 && (
                    <p className="ml-9 mt-0.5 text-[15px] leading-6 text-stone-700">
                      {Array.from(counts, ([name, n]) => (n > 1 ? `${n}× ${name}` : name)).join(" · ")}
                    </p>
                  )}
                  {line.special_instructions && <p className="ml-9 mt-1 rounded bg-amber-100 px-2 py-1 text-[15px] font-semibold text-amber-950">Note: {line.special_instructions}</p>}
                </li>
              );
            })}
          </ul>

          {(delivery || order.is_catering) && (
            <div className="mt-3 space-y-1 rounded-lg bg-cream p-3 text-[14px] text-ink">
              {delivery && order.delivery_address && (
                <p>
                  <strong>Deliver to:</strong> {order.delivery_address}
                </p>
              )}
              {order.catering_company && (
                <p>
                  <strong>Company:</strong> {order.catering_company}
                  {order.po_number ? ` · PO ${order.po_number}` : ""}
                </p>
              )}
              {order.catering_notes && <p className="whitespace-pre-line">{order.catering_notes}</p>}
              {order.invoice_email && (
                <p>
                  <strong>Invoice to:</strong> {order.invoice_email}
                </p>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[14px]">
            {order.customer_phone ? (
              <a href={`tel:${order.customer_phone}`} className="inline-flex items-center gap-1.5 font-semibold text-ink underline-offset-2 hover:underline">
                <Phone className="size-4 text-brand" aria-hidden />
                {prettyPhone(order.customer_phone)}
              </a>
            ) : (
              <span />
            )}
            <span className="font-bold text-ink">
              Collect {money(order.total_amount)}
              {Number(order.discount_amount) > 0 && <span className="ml-1 font-semibold text-emerald-700">({order.promo_code})</span>}
            </span>
          </div>
        </div>

        {order.status !== "completed" && order.status !== "cancelled" && (
          <footer className="border-t border-stone-200 p-3">
            {confirmCancel ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="flex-1 text-[14px] font-semibold text-ink">Cancel this order? The customer will be told.</p>
                <button type="button" onClick={() => setConfirmCancel(false)} className="rounded-lg px-4 py-3 text-[14px] font-bold ring-1 ring-stone-300">
                  Keep It
                </button>
                <button type="button" disabled={busy} onClick={() => run(() => onStatus("cancelled"))} className="rounded-lg bg-red-600 px-4 py-3 text-[14px] font-extrabold text-white">
                  Cancel Order
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {order.is_catering && !order.catering_confirmed_at && (
                  <button type="button" disabled={busy} onClick={() => run(onConfirmCatering)} className="flex-1 rounded-lg bg-gold px-3 py-3 text-[14px] font-extrabold uppercase tracking-wide text-ink">
                    Confirmed by Phone
                  </button>
                )}
                {later && fresh ? (
                  <button type="button" onClick={onAcknowledge} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-ink px-3 py-3.5 text-[15px] font-extrabold uppercase tracking-wide text-white">
                    <Check className="size-5" aria-hidden />
                    Got It
                  </button>
                ) : (
                  next && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => onStatus(next.status))}
                      className="flex flex-[2] items-center justify-center gap-2 rounded-lg bg-brand px-3 py-3.5 text-[15px] font-extrabold uppercase tracking-wide text-white hover:bg-brand-dark disabled:opacity-60"
                    >
                      {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <next.Icon className="size-5" aria-hidden />}
                      {next.label}
                    </button>
                  )
                )}
                <button type="button" onClick={onPrint} className="rounded-lg px-3 py-3 text-stone-600 ring-1 ring-stone-300 hover:bg-cream" aria-label="Print ticket">
                  <Printer className="size-5" />
                </button>
                <button type="button" onClick={() => setConfirmCancel(true)} className="rounded-lg px-3 py-3 text-stone-600 ring-1 ring-stone-300 hover:bg-red-50 hover:text-red-700" aria-label="Cancel order">
                  <X className="size-5" />
                </button>
              </div>
            )}
          </footer>
        )}
      </article>
    </div>
  );
}

// A kitchen ticket for the printer.
function Ticket({ order }: { order: Order }) {
  return (
    <div className="hidden p-4 font-mono text-[14px] text-black print:block">
      <p className="text-center text-lg font-bold">AL PANINOS</p>
      <p className="text-center">{order.order_type === "delivery" ? "DELIVERY" : "PICKUP"}{order.is_catering ? " - CATERING" : ""}</p>
      <p className="mt-2 text-center text-xl font-bold">{order.customer_name}</p>
      <p className="text-center">{shortId(order.id)}</p>
      <p className="text-center">
        {order.requested_ready_at ? `Wanted ${formatDayAndTime(new Date(order.requested_ready_at))}` : `Placed ${clockTime(order.created_at)}`}
      </p>
      <hr className="my-2 border-black" />
      {order.order_items.map((line) => (
        <div key={line.id} className="mb-2">
          <p className="font-bold">
            {line.menu_items?.per_person ? `${line.menu_items.name} - FOR ${line.quantity} PEOPLE` : `${line.quantity} x ${line.menu_items?.name}`}
          </p>
          {line.order_item_modifiers.map((m, i) => m.modifier_options && <p key={i}>  - {m.modifier_options.name}</p>)}
          {line.special_instructions && <p>  NOTE: {line.special_instructions}</p>}
        </div>
      ))}
      <hr className="my-2 border-black" />
      {order.delivery_address && <p>Deliver to: {order.delivery_address}</p>}
      {order.catering_notes && <p className="whitespace-pre-line">{order.catering_notes}</p>}
      {order.customer_phone && <p>Phone: {prettyPhone(order.customer_phone)}</p>}
      <p className="mt-1 font-bold">Collect: {money(order.total_amount)}</p>
    </div>
  );
}

// ---- The board ---------------------------------------------------------------

function Board({ userEmail }: { userEmail: string }) {
  const supabase = browserSupabase();
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [storeId, setStoreId] = useState<string | null>(() => readKey("alpaninos-staff-store"));
  const [orders, setOrders] = useState<Order[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(true);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [started, setStarted] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [acked, setAcked] = useState<Set<string>>(() => new Set(JSON.parse(readKey("alpaninos-staff-acked") ?? "[]")));
  const [showDone, setShowDone] = useState(false);
  const [printing, setPrinting] = useState<Order | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("locations")
      .select("id, name")
      .order("name")
      .then(({ data }) => setStores((data ?? []) as StoreRow[]));
  }, [supabase]);

  const load = useCallback(async () => {
    if (!storeId) return;
    const todayStart = storeDayStart(new Date()).toISOString();
    const { data, error } = await supabase
      .from("orders")
      .select(SELECT)
      .eq("location_id", storeId)
      .or(`status.in.(${ACTIVE.join(",")}),created_at.gte.${todayStart}`)
      .order("created_at", { ascending: true });
    if (error) {
      setOnline(false);
      return;
    }
    setOnline(true);
    setLastSync(Date.now());
    setOrders((data ?? []) as unknown as Order[]);
    setLoaded(true);
  }, [supabase, storeId]);

  // Live: database changes as they happen, plus a check every 15 seconds
  // in case the live connection drops.
  useEffect(() => {
    if (!storeId) return;
    queueMicrotask(load);
    const channel = supabase
      .channel(`staff-orders-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `location_id=eq.${storeId}` }, () => load())
      .subscribe();
    const poll = setInterval(load, 15000);
    const tick = setInterval(() => setNow(Date.now()), 20000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [supabase, storeId, load]);

  // Keep the tablet's screen on while the board is open.
  useEffect(() => {
    if (!started || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const request = () => navigator.wakeLock.request("screen").then((l) => (lock = l)).catch(() => {});
    request();
    const onVisible = () => document.visibilityState === "visible" && request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [started]);

  const active = orders.filter((o) => (ACTIVE as readonly string[]).includes(o.status));
  const isLater = useCallback((o: Order) => o.status === "received" && due(o).getTime() - now > LATER_MINUTES * 60000, [now]);
  const unacked = active.filter((o) => o.status === "received" && !acked.has(o.id));

  // The chime, every few seconds, until every new order's been seen.
  const unackedCount = unacked.length;
  useEffect(() => {
    if (!started || !soundOn || unackedCount === 0) return;
    playChime();
    const t = setInterval(playChime, 6000);
    return () => clearInterval(t);
  }, [started, soundOn, unackedCount]);
  useEffect(() => {
    document.title = unackedCount ? `(${unackedCount}) New order${unackedCount === 1 ? "" : "s"} | Al Panino's` : "Store Orders | Al Panino's";
  }, [unackedCount]);

  const acknowledge = (id: string) =>
    setAcked((prev) => {
      const next = new Set(prev).add(id);
      // Only what's still on the board is worth remembering.
      writeKey("alpaninos-staff-acked", JSON.stringify(Array.from(next).filter((x) => orders.some((o) => o.id === x))));
      return next;
    });

  const setStatus = async (order: Order, status: Order["status"]) => {
    setProblem(null);
    acknowledge(order.id);
    const { error } = await supabase.from("orders").update({ status }).eq("id", order.id);
    if (error) setProblem(`Couldn't update ${order.customer_name ?? "the order"}: ${error.message}`);
    await load();
  };
  const confirmCatering = async (order: Order) => {
    const { error } = await supabase.from("orders").update({ catering_confirmed_at: new Date().toISOString() }).eq("id", order.id);
    if (error) setProblem(error.message);
    await load();
  };

  useEffect(() => {
    if (!printing) return;
    const t = setTimeout(() => {
      window.print();
      setPrinting(null);
    }, 50);
    return () => clearTimeout(t);
  }, [printing]);

  const columns = useMemo(() => {
    const byDue = (a: Order, b: Order) => due(a).getTime() - due(b).getTime();
    const received = active.filter((o) => o.status === "received").sort(byDue);
    return [
      { key: "new", title: "New", Icon: BellRing, orders: received.filter((o) => !isLater(o)), later: received.filter(isLater) },
      { key: "press", title: "In the Press", Icon: ChefHat, orders: active.filter((o) => o.status === "preparing").sort(byDue), later: [] as Order[] },
      { key: "ready", title: "Ready & On the Way", Icon: PackageCheck, orders: active.filter((o) => o.status === "ready" || o.status === "out_for_delivery").sort(byDue), later: [] as Order[] },
    ];
  }, [active, isLater]);
  const done = orders.filter((o) => o.status === "completed" || o.status === "cancelled").reverse();
  const storeName = stores.find((s) => s.id === storeId)?.name;

  if (!storeId) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-7">
          <h1 className="font-display text-3xl font-extrabold text-ink">Which store is this?</h1>
          <p className="mt-1 text-stone-600">This tablet will show that store&apos;s orders.</p>
          <div className="mt-6 space-y-3">
            {stores.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  writeKey("alpaninos-staff-store", s.id);
                  setStoreId(s.id);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-5 py-4 text-left text-lg font-bold text-ink ring-1 ring-stone-300 hover:ring-brand"
              >
                <Store className="size-5 text-brand" aria-hidden />
                {s.name}
              </button>
            ))}
            {!stores.length && <Loader2 className="mx-auto size-6 animate-spin text-brand" aria-label="Loading" />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-dvh bg-cream-deep print:hidden">
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 bg-ink px-4 py-3 text-white">
          <p className="font-display text-xl font-extrabold">{storeName ?? "Store"}</p>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold ${online ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/30 text-red-200"}`}>
            {online ? <Wifi className="size-3.5" aria-hidden /> : <WifiOff className="size-3.5" aria-hidden />}
            {online ? `Live${lastSync ? ` · ${clockTime(new Date(lastSync).toISOString())}` : ""}` : "Can't reach orders, check the Wi-Fi"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                unlockSound();
                setSoundOn((v) => !v);
              }}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-bold ring-1 ring-white/25 hover:bg-white/10"
            >
              {soundOn ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
              {soundOn ? "Sound on" : "Sound off"}
            </button>
            <button
              type="button"
              onClick={() => {
                writeKey("alpaninos-staff-store", "");
                setStoreId(null);
                setLoaded(false);
                setOrders([]);
              }}
              className="rounded-lg px-3 py-2 text-[13px] font-bold ring-1 ring-white/25 hover:bg-white/10"
            >
              Switch store
            </button>
            <button type="button" onClick={() => browserSupabase().auth.signOut()} className="rounded-lg p-2 ring-1 ring-white/25 hover:bg-white/10" aria-label={`Sign out ${userEmail}`}>
              <LogOut className="size-4" />
            </button>
          </div>
        </div>

        {problem && (
          <p className="mx-4 mt-3 rounded-lg bg-red-100 px-4 py-3 text-[15px] font-semibold text-red-900" role="alert">
            {problem}
          </p>
        )}

        {!loaded ? (
          <div className="flex h-[60vh] items-center justify-center">
            <Loader2 className="size-8 animate-spin text-brand" aria-label="Loading orders" />
          </div>
        ) : (
          <div className="grid gap-4 p-4 md:grid-cols-3">
            {columns.map((col) => (
              <section key={col.key} aria-label={col.title} className="min-w-0">
                <h2 className="flex items-center gap-2 px-1 pb-2 text-[14px] font-extrabold uppercase tracking-wide text-ink">
                  <col.Icon className="size-4 text-brand" aria-hidden />
                  {col.title}
                  <span className="rounded-full bg-ink px-2 text-[12px] text-white">{col.orders.length}</span>
                </h2>
                <div className="space-y-3">
                  {col.orders.map((o) => (
                    <OrderCard
                      key={o.id}
                      order={o}
                      now={now}
                      later={false}
                      acknowledged={acked.has(o.id)}
                      onAcknowledge={() => acknowledge(o.id)}
                      onStatus={(s) => setStatus(o, s)}
                      onConfirmCatering={() => confirmCatering(o)}
                      onPrint={() => setPrinting(o)}
                    />
                  ))}
                  {col.orders.length === 0 && <p className="rounded-2xl border-2 border-dashed border-stone-300 px-4 py-8 text-center text-[15px] text-stone-500">Nothing here</p>}
                  {col.later.length > 0 && (
                    <>
                      <h3 className="px-1 pt-3 text-[13px] font-extrabold uppercase tracking-wide text-stone-600">Later ({col.later.length})</h3>
                      {col.later.map((o) => (
                        <OrderCard
                          key={o.id}
                          order={o}
                          now={now}
                          later
                          acknowledged={acked.has(o.id)}
                          onAcknowledge={() => acknowledge(o.id)}
                          onStatus={(s) => setStatus(o, s)}
                          onConfirmCatering={() => confirmCatering(o)}
                          onPrint={() => setPrinting(o)}
                        />
                      ))}
                    </>
                  )}
                </div>
              </section>
            ))}
          </div>
        )}

        {done.length > 0 && (
          <div className="px-4 pb-8">
            <button type="button" onClick={() => setShowDone((v) => !v)} className="text-[14px] font-bold text-stone-700 underline">
              {showDone ? "Hide" : "Show"} today&apos;s finished orders ({done.length})
            </button>
            {showDone && (
              <ul className="mt-3 divide-y divide-stone-200 rounded-xl bg-white">
                {done.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[14px]">
                    <span className="font-bold text-ink">
                      {o.customer_name} <span className="font-normal text-stone-500">{shortId(o.id)}</span>
                    </span>
                    <span className="text-stone-600">
                      {o.order_items.map((l) => (l.menu_items?.per_person ? `${l.menu_items.name} for ${l.quantity}` : `${l.quantity} ${l.menu_items?.name}`)).join(", ")}
                    </span>
                    <span className={`font-bold ${o.status === "cancelled" ? "text-red-700" : "text-emerald-700"}`}>
                      {o.status === "cancelled" ? "Cancelled" : "Done"} · {money(o.total_amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {printing && <Ticket order={printing} />}

      {/* Sound needs one tap before a browser will play it. */}
      {!started && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 px-4 print:hidden">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center">
            <BellRing className="mx-auto size-12 text-brand" aria-hidden />
            <h2 className="mt-4 font-display text-3xl font-extrabold text-ink">Ready for orders?</h2>
            <p className="mt-2 text-[16px] text-stone-600">Tap below so this tablet can chime when an order comes in. Keep this page open and the volume up.</p>
            <button
              type="button"
              onClick={() => {
                unlockSound();
                playChime();
                setStarted(true);
              }}
              className="mt-6 w-full rounded-lg bg-brand py-4 text-[16px] font-extrabold uppercase tracking-wide text-white"
            >
              Start Taking Orders
            </button>
          </div>
        </div>
      )}

      {unackedCount > 0 && started && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center print:hidden">
          <p className="flex items-center gap-2 rounded-full bg-brand px-5 py-3 text-[16px] font-extrabold text-white shadow-2xl">
            <BellRing className="size-5 animate-bounce" aria-hidden />
            {unackedCount} new order{unackedCount === 1 ? "" : "s"}
          </p>
        </div>
      )}
    </>
  );
}

// The store's order screen, for a tablet at the counter: staff sign in,
// pick their store once, and every order for it shows up live with a chime
// -- New, In the Press, Ready -- with one tap to move it along. Each tap
// updates the customer's tracker (and sends their notification) too.
export default function StaffScreen() {
  const { ready, user, isMember } = useSession();
  const [role, setRole] = useState<{ userId: string; staff: boolean } | null>(null);
  const checked = useRef<string | null>(null);

  useEffect(() => {
    if (!user || user.is_anonymous || checked.current === user.id) return;
    checked.current = user.id;
    browserSupabase()
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setRole({ userId: user.id, staff: data?.role === "staff" || data?.role === "admin" }));
  }, [user]);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink">
        <Loader2 className="size-8 animate-spin text-white" aria-label="Loading" />
      </div>
    );
  }
  if (!isMember || !user) return <StaffSignIn />;
  if (!role || role.userId !== user.id) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink">
        <Loader2 className="size-8 animate-spin text-white" aria-label="Checking your account" />
      </div>
    );
  }
  if (!role.staff) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-7 text-center">
          <h1 className="font-display text-2xl font-extrabold text-ink">This isn&apos;t a staff account</h1>
          <p className="mt-2 text-stone-600">
            {user.email} can&apos;t see store orders. The owner can turn it into a staff account in Supabase (users table, role: staff).
          </p>
          <button type="button" onClick={() => browserSupabase().auth.signOut()} className="mt-6 rounded-lg bg-brand px-6 py-3.5 text-[14px] font-extrabold uppercase tracking-wide text-white">
            Sign Out
          </button>
        </div>
      </div>
    );
  }
  return <Board userEmail={user.email ?? ""} />;
}
