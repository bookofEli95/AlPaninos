"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Car, Check, CheckCircle2, Loader2, Lock, MailCheck, MapPin, ShoppingBag, Sparkles, Store as StoreIcon } from "lucide-react";
import CartLines from "@/components/ordering/cart-lines";
import { useOrdering } from "@/components/ordering/ordering-provider";
import StoreStatus from "@/components/store-status";
import PromoBox from "./promo-box";
import { CateringTimePicker, RegularTimePicker } from "./time-picker";
import { browserSupabase, ensureSession, friendlyAuthError, useSession } from "@/lib/browser-supabase";
import { cartTotals, mainCart, useHydrated, type CartStore } from "@/lib/cart";
import { COUNTRIES, DEFAULT_COUNTRY, formatPhoneNumber, isValidPhoneForCountry, parsePhone, type Country } from "@/lib/ordering/countries";
import { canOrderAsap, estimateReadyMinutes, formatDayAndTime, getOrderDays, isOrderTimeAvailable } from "@/lib/ordering/timing";
import { CATERING_MAX_DELIVERY_KM, getCateringDays, isCateringSlotAllowed } from "@/lib/ordering/catering";
import { pointsForSubtotal, pointsProgressLabel } from "@/lib/ordering/points";
import type { Store } from "@/lib/menu";
import { storeStatus } from "@/lib/hours";
import { money } from "@/lib/format";

type Profile = { first_name: string | null; last_name: string | null; phone: string | null; notify_email: boolean | null; notify_sms: boolean | null; panino_points: number | null };

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
const inputClass =
  "mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3.5 py-3 text-[15px] text-ink outline-none transition placeholder:text-stone-400 focus:border-brand focus:ring-4 focus:ring-brand/10";
const labelClass = "text-xs font-bold uppercase tracking-wide text-stone-500";

function Section({ n, title, children, id }: { n: number; title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-28 rounded-2xl bg-white p-5 ring-1 ring-stone-200 sm:p-7">
      <h2 className="flex items-center gap-3 font-display text-xl font-extrabold text-ink">
        <span className="flex size-8 items-center justify-center rounded-full bg-ink text-[14px] text-white">{n}</span>
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

// One part of the catering order form.
function FormPart({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-28 px-5 py-6 sm:px-8 sm:py-7">
      <h3 className="font-display text-xl font-extrabold text-ink">{title}</h3>
      <div className="mt-4">{children}</div>
    </div>
  );
}

// Checkout -- the app's cart screen as a web page: how and where, when,
// who it's for (a guest verifies their email with a code, as in the app),
// catering details, updates, deals, then Place Order. The database prices
// everything again and stops if the total doesn't match what's shown.
//
// The catering page uses it too, for its own order (`orderStore`): its
// package builder comes first (`lead`), and the order goes in with "Send it
// to Al".
export default function Checkout({
  stores,
  orderStore = mainCart,
  variant = "checkout",
  lead,
  onChooseStore,
  onEditOrder,
  validate,
}: {
  stores: Store[];
  orderStore?: CartStore;
  variant?: "checkout" | "catering";
  lead?: { title: string; id: string; node: ReactNode };
  // Instead of "switching empties your order" (the catering form carries its
  // packages over to the other store).
  onChooseStore?: (storeId: string) => void;
  onEditOrder?: () => void;
  // Checks of the caller's own before the order goes in (the catering form's
  // required choices).
  validate?: () => { message: string; target?: string } | null;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const c = orderStore.useOrder();
  const cart = orderStore.cart;
  const { openCart } = useOrdering();
  const cateringForm = variant === "catering";
  const signInHref = cateringForm ? "/signin?next=/catering" : "/signin?next=/checkout";
  const { ready, user, isMember } = useSession();
  const store = stores.find((s) => s.id === c.storeId) ?? null;
  const totals = cartTotals(c, Number(store?.tax_rate ?? 0.13));
  // The catering form is catering before a package is picked, too.
  const isCatering = cateringForm || totals.isCatering;

  // ---- who it's for ------------------------------------------------------
  const [loadedProfile, setLoadedProfile] = useState<{ userId: string; profile: Profile } | null>(null);
  const profile = user && !user.is_anonymous && loadedProfile?.userId === user.id ? loadedProfile.profile : null;
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [email, setEmail] = useState("");
  const phoneRef = useRef(phone);
  useEffect(() => {
    phoneRef.current = phone;
  });
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifySms, setNotifySms] = useState(false);
  // A guest who verifies here becomes a (password-less) account; they stay
  // on the guest form until this order is in.
  const guestForm = !isMember || !!verifiedEmail;
  const needsDetails = isMember && !verifiedEmail && !!profile && (!profile.first_name?.trim() || !profile.last_name?.trim() || !profile.phone?.trim());

  useEffect(() => {
    if (!user || user.is_anonymous) return;
    let cancelled = false;
    browserSupabase()
      .from("profiles")
      .select("first_name, last_name, phone, notify_email, notify_sms, panino_points")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setLoadedProfile({ userId: user.id, profile: data as Profile });
        setNotifyEmail(data.notify_email ?? true);
        setNotifySms(data.notify_sms ?? false);
        // Fills only what's still empty -- a guest who just verified their
        // email keeps what they typed.
        setFirstName((v) => v || (data.first_name ?? ""));
        setLastName((v) => v || (data.last_name ?? ""));
        if (data.phone && !phoneRef.current) {
          const parsed = parsePhone(data.phone);
          setPhone(parsed.digits);
          setCountry(parsed.country);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // A returning guest: last order's name and phone.
  useEffect(() => {
    if (!user?.is_anonymous) return;
    browserSupabase()
      .from("orders")
      .select("customer_name, customer_phone, customer_email")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const [first, ...rest] = (data.customer_name ?? "").trim().split(/\s+/);
        setFirstName((v) => v || first || "");
        setLastName((v) => v || rest.join(" "));
        const parsed = parsePhone(data.customer_phone ?? "");
        setCountry(parsed.country);
        setPhone((v) => v || parsed.digits);
      });
  }, [user?.id, user?.is_anonymous]);

  // ---- when --------------------------------------------------------------
  const [pickedSlot, setSlot] = useState<Date | null>(null);
  const [rush, setRush] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!c.storeId) return;
    browserSupabase()
      .rpc("get_store_rush", { p_location_id: c.storeId })
      .then(({ data }) => setRush(Number(data?.extra_minutes ?? 0)));
  }, [c.storeId]);

  const hours = store?.hours ?? null;
  const now = useMemo(() => new Date(clock), [clock]);
  const asapAvailable = canOrderAsap(hours, c.mode, totals.itemCount, rush, now);
  const asapMinutes = estimateReadyMinutes(c.mode, totals.itemCount, rush);
  const orderDays = useMemo(() => getOrderDays(hours, c.mode, totals.itemCount, rush, now), [hours, c.mode, totals.itemCount, rush, now]);
  const cateringDays = useMemo(() => getCateringDays(hours, now), [hours, now]);

  // The time the order is for: the one picked while it's still possible
  // (otherwise none), and for a closed store its first open time -- never
  // "ASAP" while closed.
  const slot = useMemo(() => {
    if (isCatering) {
      return pickedSlot && cateringDays.some((d) => d.slots.some((s) => s.time.getTime() === pickedSlot.getTime())) ? pickedSlot : null;
    }
    if (pickedSlot && isOrderTimeAvailable(pickedSlot, hours, c.mode, totals.itemCount, rush, now)) return pickedSlot;
    return asapAvailable ? null : orderDays[0]?.slots[0]?.time ?? null;
  }, [isCatering, pickedSlot, cateringDays, hours, c.mode, totals.itemCount, rush, now, asapAvailable, orderDays]);

  // ---- catering ----------------------------------------------------------
  const [company, setCompany] = useState("");
  const [po, setPo] = useState("");
  const [invoiceEmail, setInvoiceEmail] = useState("");
  const [suite, setSuite] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [dietary, setDietary] = useState("");
  const [extraNotes, setExtraNotes] = useState("");

  // ---- store switch ------------------------------------------------------
  const [pendingStore, setPendingStore] = useState<Store | null>(null);
  const chooseStore = (id: string) => {
    const next = stores.find((s) => s.id === id);
    if (!next || next.id === c.storeId) return;
    if (onChooseStore) return onChooseStore(next.id);
    if (c.lines.length) setPendingStore(next);
    else cart.setStore(next.id, next.name);
  };

  // ---- placing it --------------------------------------------------------
  const [placing, setPlacing] = useState(false);
  const [problem, setProblem] = useState<{ message: string; target?: string } | null>(null);
  const [priceChange, setPriceChange] = useState<number | null>(null);
  const checkoutKey = useRef<{ key: string; signature: string } | null>(null);

  const fail = (message: string, target?: string) => {
    setProblem({ message, target });
    if (target) document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const sendCode = async () => {
    setEmailError(null);
    if (!isValidEmail(email)) return setEmailError("Enter a valid email address first.");
    setEmailBusy(true);
    try {
      await ensureSession();
      const { error } = await browserSupabase().auth.updateUser({ email: email.trim() });
      if (error) throw error;
      setCodeSent(true);
      setCode("");
    } catch (e) {
      setEmailError(friendlyAuthError(e instanceof Error ? e.message : String(e)));
    } finally {
      setEmailBusy(false);
    }
  };

  const verifyCode = async () => {
    setEmailError(null);
    setEmailBusy(true);
    try {
      const { error } = await browserSupabase().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email_change" });
      if (error) throw error;
      setVerifiedEmail(email.trim().toLowerCase());
      setCodeSent(false);
    } catch (e) {
      setEmailError(friendlyAuthError(e instanceof Error ? e.message : String(e)));
    } finally {
      setEmailBusy(false);
    }
  };

  const emailVerified = !!verifiedEmail && verifiedEmail === email.trim().toLowerCase();

  const placeOrder = useCallback(
    async (acceptedTotal?: number) => {
      setProblem(null);
      setPriceChange(null);
      if (!store) return;
      if (!c.lines.length) return fail("Pick a package first.", lead?.id);
      const blocked = validate?.();
      if (blocked) return fail(blocked.message, blocked.target);
      if (c.mode === "delivery" && !c.address.trim()) return fail("Add the address we're delivering to.", "address");
      if (isCatering) {
        if (!slot) return fail("Pick the day and time you need your catering.", "when");
        if (!isCateringSlotAllowed(slot)) {
          setSlot(null);
          return fail("Catering needs to be ordered by 6 PM the day before. Please choose another day.", "when");
        }
        if (c.mode === "delivery" && !dropoff.trim()) return fail('Tell us where to drop it off (for example "Front reception, 3rd floor").', "dropoff");
        if (invoiceEmail.trim() && !isValidEmail(invoiceEmail)) return fail("Check the invoice email address, or leave it blank.", "invoice");
      } else {
        if (slot && !isOrderTimeAvailable(slot, hours, c.mode, totals.itemCount, rush)) {
          setSlot(null);
          return fail("That time has passed or the store is closed then. Please choose another time.", "when");
        }
        if (!slot && !canOrderAsap(hours, c.mode, totals.itemCount, rush)) return fail("It's too late for as soon as possible. Choose a time when the store is open.", "when");
      }
      if (guestForm || needsDetails) {
        if (!firstName.trim() || !lastName.trim() || !phone.trim()) return fail("Enter your name and phone number.", "details");
        if (!isValidPhoneForCountry(phone, country)) return fail(`Enter a valid phone number for ${country.name}.`, "details");
      }
      if (guestForm && !emailVerified) return fail("Verify your email with the code we send you, so we can send your receipt and updates.", "details");
      if (!notifyEmail && !notifySms) return fail("Choose at least one way to get order updates.", "updates");

      setPlacing(true);
      try {
        const supabase = browserSupabase();
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) throw userError ?? new Error("Please verify your email or sign in to place the order.");
        const me = userData.user;
        const fullPhone = `+${country.dialCode}${phone.replace(/[^0-9]/g, "")}`;
        let customerName = `${firstName.trim()} ${lastName.trim()}`;
        let customerPhone = fullPhone;
        if (!guestForm) {
          if (needsDetails) {
            const { error } = await supabase.from("profiles").update({ first_name: firstName.trim(), last_name: lastName.trim(), phone: fullPhone }).eq("id", me.id);
            if (error) throw error;
          } else if (profile) {
            customerName = `${profile.first_name} ${profile.last_name}`;
            customerPhone = profile.phone ?? fullPhone;
          }
        }

        const signature = JSON.stringify([
          c.storeId,
          c.mode,
          slot?.toISOString() ?? null,
          c.promo?.code ?? null,
          c.lines.map((l) => [l.menuItemId, l.quantity, l.options.map((o) => o.optionId), l.specialInstructions ?? "", l.rewardCode ?? ""]),
        ]);
        if (!checkoutKey.current || checkoutKey.current.signature !== signature) {
          checkoutKey.current = { key: `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 18)}`, signature };
        }
        const estimated = (slot ?? new Date(Date.now() + estimateReadyMinutes(c.mode, totals.itemCount, rush) * 60000)).toISOString();

        const { data: placed, error } = await supabase.rpc("place_order", {
          p: {
            client_key: checkoutKey.current.key,
            location_id: c.storeId,
            order_type: c.mode,
            delivery_address: c.mode === "delivery" ? c.address.trim() : null,
            requested_ready_at: slot ? slot.toISOString() : null,
            estimated_ready_at: estimated,
            customer_name: customerName,
            customer_phone: customerPhone,
            customer_email: guestForm ? email.trim() : me.email,
            notify_email: notifyEmail,
            notify_sms: notifySms,
            // Only a code that's taking money off is sent (and so spent).
            promo_code: c.promo && totals.discount > 0 ? c.promo.code : null,
            catering_company: company.trim() || null,
            po_number: po.trim() || null,
            invoice_email: invoiceEmail.trim() || null,
            catering_notes:
              [
                dietary.trim() && `Dietary: ${dietary.trim()}`,
                c.mode === "delivery" && suite.trim() && `Floor/Suite: ${suite.trim()}`,
                c.mode === "delivery" && dropoff.trim() && `Drop-off: ${dropoff.trim()}`,
                extraNotes.trim() && `Notes: ${extraNotes.trim()}`,
              ]
                .filter(Boolean)
                .join("\n") || null,
            expected_total: Math.round((acceptedTotal ?? totals.total) * 100) / 100,
            items: c.lines.map((l) => ({
              menu_item_id: l.menuItemId,
              quantity: l.quantity,
              special_instructions: l.specialInstructions || null,
              reward_code: l.rewardCode ?? null,
              option_ids: l.options.map((o) => o.optionId),
            })),
          },
        });
        if (error) {
          if (error.message === "PRICE_CHANGED" && error.details) {
            setPriceChange(Number(error.details));
            return;
          }
          throw error;
        }

        // A guest's details are the only name and phone their new account has.
        if (guestForm) {
          await supabase.from("profiles").update({ first_name: firstName.trim(), last_name: lastName.trim(), phone: fullPhone }).eq("id", me.id).is("first_name", null);
        }
        checkoutKey.current = null;
        cart.clear();
        router.push(`/order/${placed.order_id}?placed=1`);
      } catch (e) {
        fail(e instanceof Error ? e.message : "Something went wrong placing your order. Please try again.");
      } finally {
        setPlacing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, c, totals, slot, hours, rush, guestForm, needsDetails, firstName, lastName, phone, country, email, emailVerified, notifyEmail, notifySms, profile, company, po, invoiceEmail, suite, dropoff, dietary, extraNotes]
  );

  // ---- rendering ---------------------------------------------------------
  if (!hydrated || !ready) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-7 animate-spin text-brand" aria-label="Loading checkout" />
      </div>
    );
  }

  if (!store && cateringForm) return null;
  if (!store || (!c.lines.length && !cateringForm)) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-cream-deep">
          <ShoppingBag className="size-7 text-brand" aria-hidden />
        </span>
        <h1 className="mt-5 font-display text-3xl font-extrabold text-ink">Your order is empty</h1>
        <p className="mt-2 text-stone-500">Add something from the menu, then come back here to check out.</p>
        <Link href="/menu" className="mt-7 rounded-lg bg-brand px-7 py-4 text-[14px] font-extrabold uppercase tracking-wide text-white hover:bg-brand-dark">
          Browse the Menu
        </Link>
      </div>
    );
  }

  const points = pointsForSubtotal(totals.subtotal).toLocaleString("en-CA");
  // On the catering page the form already sits in its own labelled section,
  // so the summary is a plain box there rather than a sidebar landmark.
  const SummaryBox = cateringForm ? "div" : "aside";
  const readyLabel = cateringForm ? "Send it to Al" : "Place Order";
  const placeLabel = !c.lines.length ? "Pick a package to start" : guestForm && !emailVerified ? "Verify your email to continue" : readyLabel;
  const whenLabel = slot ? formatDayAndTime(slot) : isCatering ? "· pick a day and time" : `in about ${asapMinutes} min`;
  let n = 0;

  const howWhere = (
    <>
      <div className="grid grid-cols-2 overflow-hidden rounded-xl ring-1 ring-stone-300">
        {(
          [
            { key: "pickup", label: "Pickup", Icon: StoreIcon },
            { key: "delivery", label: "Delivery", Icon: Car },
          ] as const
        ).map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => cart.setMode(key)}
            aria-pressed={c.mode === key}
            className={`flex items-center justify-center gap-2 py-3.5 text-[14px] font-extrabold uppercase tracking-wide transition-colors ${
              c.mode === key ? "bg-ink text-white" : "bg-white text-stone-500 hover:text-ink"
            }`}
          >
            <Icon className="size-[18px]" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      <label className="mt-5 block">
        <span className={labelClass}>{c.mode === "delivery" ? "Delivered from" : "Pick up at"}</span>
        <select value={c.storeId ?? ""} onChange={(e) => chooseStore(e.target.value)} className={inputClass}>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.address ? ` · ${s.address}` : ""}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 text-[13px] text-stone-500">
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3.5" aria-hidden />
          {store.address}
        </span>
        <StoreStatus hours={store.hours} />
      </p>
      {pendingStore && (
        <div className="mt-4 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="text-[14px] text-amber-950">
            Each store has its own menu, so switching to <strong>{pendingStore.name}</strong> empties your order.
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setPendingStore(null)} className="rounded-lg bg-white px-4 py-2.5 text-[14px] font-bold text-ink ring-1 ring-stone-300">
              Keep {store.name}
            </button>
            <button
              type="button"
              onClick={() => {
                cart.setStore(pendingStore.id, pendingStore.name);
                setPendingStore(null);
                router.push(`/menu?store=${pendingStore.id}&mode=${c.mode}`);
              }}
              className="rounded-lg bg-brand px-4 py-2.5 text-[14px] font-extrabold text-white"
            >
              Switch and Start Over
            </button>
          </div>
        </div>
      )}

      {c.mode === "delivery" && (
        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto]">
          <label className="block" id="address">
            <span className={labelClass}>Delivery address</span>
            <input value={c.address} onChange={(e) => cart.setAddress(e.target.value)} placeholder="Street address, city" autoComplete="street-address" className={inputClass} />
          </label>
          {isCatering && (
            <label className="block sm:w-44">
              <span className={labelClass}>Floor / suite</span>
              <input value={suite} onChange={(e) => setSuite(e.target.value)} placeholder="Optional" className={inputClass} />
            </label>
          )}
        </div>
      )}
    </>
  );
  const whenBlock = (
    <>
      {isCatering ? (
        <CateringTimePicker days={cateringDays} slot={slot} onChange={setSlot} />
      ) : (
        <RegularTimePicker openNow={storeStatus(hours, now).open} asapAvailable={asapAvailable} asapMinutes={asapMinutes} days={orderDays} slot={slot} onChange={setSlot} mode={c.mode} />
      )}
    </>
  );
  const detailsBlock = (
    <>
      {!guestForm && !needsDetails && profile ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-cream p-4">
          <div>
            <p className="text-[15px] font-bold text-ink">
              {profile.first_name} {profile.last_name}
            </p>
            <p className="text-[14px] text-stone-600">
              {user?.email} · {profile.phone}
            </p>
          </div>
          <Link href="/account" className="text-[14px] font-bold text-brand hover:underline">
            Edit in your account
          </Link>
        </div>
      ) : (
        <>
          {guestForm && !verifiedEmail && (
            <p className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-cream p-4 text-[14px] text-stone-700">
              <Sparkles className="size-4 text-brand" aria-hidden />
              Have an account?
              <Link href={signInHref} className="font-bold text-brand hover:underline">
                Sign in
              </Link>
              {c.lines.length ? `to earn ${points} PaninoPoints on this order.` : "to earn PaninoPoints on this order."}
            </p>
          )}
          {needsDetails && <p className="mb-4 text-[14px] text-stone-600">Add your name and a phone number the store can reach you on. We&apos;ll save them to your account.</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>First name</span>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Last name</span>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" className={inputClass} />
            </label>
            <div className="sm:col-span-2">
              <span className={labelClass}>Mobile number</span>
              <div className="mt-1.5 flex gap-2">
                <label className="sr-only" htmlFor="country">
                  Country code
                </label>
                <select
                  id="country"
                  value={country.code}
                  onChange={(e) => setCountry(COUNTRIES.find((x) => x.code === e.target.value) ?? DEFAULT_COUNTRY)}
                  className="w-28 rounded-lg border border-stone-300 bg-white px-2.5 text-[15px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
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
                  autoComplete="tel-national"
                  placeholder={country.dialCode === "1" ? "519-555-0123" : ""}
                  aria-label="Mobile number"
                  className="w-full rounded-lg border border-stone-300 bg-white px-3.5 py-3 text-[15px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
                />
              </div>
            </div>
          </div>

          {guestForm && (
            <div className="mt-5 rounded-xl ring-1 ring-stone-200">
              <div className="p-4">
                <div>
                  <label htmlFor="guest-email" className={labelClass}>
                    Email
                  </label>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      id="guest-email"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setCodeSent(false);
                      }}
                      readOnly={emailVerified}
                      autoComplete="email"
                      placeholder="you@example.com"
                      className="w-full rounded-lg border border-stone-300 bg-white px-3.5 py-3 text-[15px] outline-none read-only:bg-stone-50 focus:border-brand focus:ring-4 focus:ring-brand/10"
                    />
                    {emailVerified ? (
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-50 px-3.5 text-[14px] font-bold text-emerald-700">
                        <CheckCircle2 className="size-4" aria-hidden />
                        Verified
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={sendCode}
                        disabled={emailBusy || !email.trim()}
                        className="shrink-0 rounded-lg bg-ink px-4 text-[14px] font-extrabold uppercase tracking-wide text-white hover:bg-black disabled:opacity-40"
                      >
                        {emailBusy && !codeSent ? <Loader2 className="size-4 animate-spin" aria-label="Sending" /> : codeSent ? "Resend" : "Send Code"}
                      </button>
                    )}
                  </div>
                </div>
                {!emailVerified && !codeSent && <p className="mt-2 text-[13px] text-stone-500">We&apos;ll email you a 6-digit code. It&apos;s how we send your receipt and order updates.</p>}
              </div>
              {codeSent && !emailVerified && (
                <div className="border-t border-stone-200 bg-cream/60 p-4">
                  <p className="flex items-center gap-2 text-[14px] text-ink">
                    <MailCheck className="size-4 text-brand" aria-hidden />
                    Enter the 6-digit code we sent to <strong>{email.trim()}</strong>.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                      onKeyDown={(e) => e.key === "Enter" && code.length === 6 && verifyCode()}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="123456"
                      aria-label="Verification code"
                      className="w-40 rounded-lg border border-stone-300 bg-white px-3.5 py-3 text-center font-mono text-xl tracking-[0.3em] outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
                    />
                    <button
                      type="button"
                      onClick={verifyCode}
                      disabled={emailBusy || code.length !== 6}
                      className="rounded-lg bg-brand px-5 text-[14px] font-extrabold uppercase tracking-wide text-white hover:bg-brand-dark disabled:opacity-40"
                    >
                      {emailBusy ? <Loader2 className="size-4 animate-spin" aria-label="Checking" /> : "Verify"}
                    </button>
                  </div>
                </div>
              )}
              {emailError && (
                <p className="border-t border-stone-200 px-4 py-3 text-[14px] font-medium text-brand" role="alert">
                  {emailError}{" "}
                  {/account/.test(emailError) && (
                    <Link href={signInHref} className="font-bold underline">
                      Sign in
                    </Link>
                  )}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
  const cateringBlock = (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className={labelClass}>Dietary needs</span>
          <textarea
            value={dietary}
            onChange={(e) => setDietary(e.target.value.slice(0, 500))}
            rows={2}
            placeholder="e.g. 3 vegetarian, 1 gluten-free, 1 nut allergy"
            className={`${inputClass} resize-none`}
          />
          <span className="mt-1.5 block text-[13px] text-stone-500">Every dietary order is wrapped and labelled separately.</span>
        </label>
        {c.mode === "delivery" && (
          <label className="block sm:col-span-2" id="dropoff">
            <span className={labelClass}>Drop-off instructions</span>
            <input value={dropoff} onChange={(e) => setDropoff(e.target.value)} placeholder="Front reception, 3rd floor" className={inputClass} />
          </label>
        )}
        <label className="block sm:col-span-2">
          <span className={labelClass}>Anything else?</span>
          <textarea
            value={extraNotes}
            onChange={(e) => setExtraNotes(e.target.value.slice(0, 500))}
            rows={2}
            placeholder="Favourites, set-up, the occasion... (optional)"
            className={`${inputClass} resize-none`}
          />
        </label>
      </div>
      <details className="group mt-5 rounded-xl ring-1 ring-stone-200 [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3.5 text-[15px] font-bold text-ink">
          Ordering for work? Add a company, PO number or invoice email
          <span className="text-[13px] font-semibold text-brand group-open:hidden">Add</span>
        </summary>
        <div className="grid gap-4 border-t border-stone-200 p-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>Company</span>
            <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Optional" autoComplete="organization" className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>PO number</span>
            <input value={po} onChange={(e) => setPo(e.target.value)} placeholder="Optional" className={inputClass} />
          </label>
          <label className="block sm:col-span-2" id="invoice">
            <span className={labelClass}>Send the invoice to</span>
            <input type="email" value={invoiceEmail} onChange={(e) => setInvoiceEmail(e.target.value)} placeholder="accounts@company.com (optional)" className={inputClass} />
          </label>
        </div>
      </details>
      <p className="mt-4 text-[13px] text-stone-500">We&apos;ll call to confirm every catering order. Delivery is free within {CATERING_MAX_DELIVERY_KM} km of the store.</p>
    </>
  );
  const updatesBlock = (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            { on: notifyEmail, set: setNotifyEmail, title: "Email", note: "Receipt and status updates" },
            { on: notifySms, set: setNotifySms, title: "Text message", note: "When it's ready or on the way" },
          ] as const
        ).map((o) => (
          <label key={o.title} className={`flex cursor-pointer items-start gap-3 rounded-xl p-4 ring-1 transition ${o.on ? "ring-2 ring-brand" : "ring-stone-200 hover:ring-stone-400"}`}>
            <input type="checkbox" checked={o.on} onChange={(e) => o.set(e.target.checked)} className="sr-only" />
            <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border ${o.on ? "border-brand bg-brand" : "border-stone-300"}`} aria-hidden>
              {o.on && <Check className="size-3.5 text-white" strokeWidth={3} />}
            </span>
            <span>
              <span className="block text-[15px] font-bold text-ink">{o.title}</span>
              <span className="block text-[13px] text-stone-500">{o.note}</span>
            </span>
          </label>
        ))}
      </div>
    </>
  );
  const dealsBlock = (
    <>
      <PromoBox c={c} discount={totals.discount} unmetReason={totals.unmetReason} userId={user?.id ?? null} isMember={isMember && !verifiedEmail} />
    </>
  );
  const summary = (
    <SummaryBox id="order-summary" className={`scroll-mt-28 ${cateringForm ? "" : "lg:sticky lg:top-[calc(var(--header-height)+1.5rem)]"}`}>
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
        <div className="bg-ink px-6 py-5 text-white">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-extrabold">{cateringForm ? "Your catering order" : "Order summary"}</h2>
            {c.lines.length > 0 && (
              <button type="button" onClick={onEditOrder ?? openCart} className="text-[13px] font-bold text-gold hover:underline">
                Edit
              </button>
            )}
          </div>
          <p className="mt-1 text-[14px] text-stone-300">
            {c.mode === "delivery" ? "Delivery" : "Pickup"} {whenLabel} · {store.name}
          </p>
        </div>
        <div className="max-h-[36vh] overflow-y-auto px-6">
          {c.lines.length ? (
            <CartLines lines={c.lines} compact readOnly />
          ) : (
            <p className="py-5 text-[14px] text-stone-500">Pick a package and how many people, and your total shows up right here.</p>
          )}
        </div>
        <dl className="space-y-1.5 border-t border-stone-200 px-6 py-5 text-[15px]">
          <div className="flex justify-between">
            <dt className="text-stone-600">Subtotal</dt>
            <dd className="tabular-nums text-ink">{money(totals.subtotal)}</dd>
          </div>
          {totals.discount > 0 && (
            <div className="flex justify-between text-emerald-700">
              <dt>{c.promo?.title}</dt>
              <dd className="tabular-nums">−{money(totals.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-stone-600">HST ({Math.round(Number(store.tax_rate ?? 0.13) * 100)}%)</dt>
            <dd className="tabular-nums text-ink">{money(totals.tax)}</dd>
          </div>
          <div className="flex justify-between border-t border-stone-200 pt-3 text-lg">
            <dt className="font-extrabold text-ink">Total</dt>
            <dd className="font-extrabold tabular-nums text-ink">{money(totals.total)}</dd>
          </div>
        </dl>
        <div className="border-t border-stone-200 bg-cream/60 px-6 py-5">
          {!c.lines.length ? null : isMember && !verifiedEmail ? (
            <p className="mb-4 flex items-start gap-2 text-[14px] text-ink">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <span>
                This order earns <strong>{points} PaninoPoints</strong>, {pointsProgressLabel((profile?.panino_points ?? 0) + pointsForSubtotal(totals.subtotal))}.
              </span>
            </p>
          ) : (
            <p className="mb-4 flex items-start gap-2 text-[14px] text-stone-600">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <span>
                {emailVerified ? (
                  <>
                    This order earns <strong>{points} PaninoPoints</strong>, saved to your email.
                  </>
                ) : (
                  <>
                    Verify your email to keep the <strong>{points} PaninoPoints</strong> this order earns.
                  </>
                )}
              </span>
            </p>
          )}

          {problem && (
            <p className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-[14px] text-red-800 ring-1 ring-red-200" role="alert">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {problem.message}
            </p>
          )}
          {priceChange != null ? (
            <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
              <p className="text-[14px] text-amber-950">
                Some prices changed since these went in your order. Your total is now <strong>{money(priceChange)}</strong> (it was {money(totals.total)}).
              </p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setPriceChange(null)} className="flex-1 rounded-lg bg-white py-3 text-[14px] font-bold text-ink ring-1 ring-stone-300">
                  Cancel
                </button>
                <button type="button" onClick={() => placeOrder(priceChange)} className="flex-1 rounded-lg bg-brand py-3 text-[14px] font-extrabold text-white">
                  Place for {money(priceChange)}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => placeOrder()}
              disabled={placing}
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-5 py-4 text-white transition-colors disabled:opacity-70 ${
                placeLabel === readyLabel ? "bg-brand hover:bg-brand-dark" : "bg-stone-500 hover:bg-stone-600"
              }`}
            >
              <span className="flex items-center gap-2 text-[15px] font-extrabold uppercase tracking-wide">
                {placing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Lock className="size-4" aria-hidden />}
                {placing ? (cateringForm ? "Sending it to Al" : "Placing your order") : placeLabel}
              </span>
              <span className="text-[16px] font-extrabold tabular-nums">{money(totals.total)}</span>
            </button>
          )}
          <p className="mt-3 text-center text-[12px] leading-5 text-stone-500">
            {isCatering && "We call to confirm every catering order before we start. "}
            You pay when you {c.mode === "delivery" ? "get your delivery" : "pick up your order"}. By placing this order you agree to our{" "}
            <Link href="/terms" className="underline hover:text-ink">
              Terms
            </Link>
            .
          </p>
        </div>
      </div>
    </SummaryBox>
  );

  // The catering page: one order form, top to bottom, like a printed one --
  // then the order with its total and "Send it to Al".
  if (cateringForm) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="overflow-hidden rounded-2xl bg-white shadow-xl shadow-black/[0.04] ring-1 ring-stone-200">
          <div className="grain flex items-center justify-between gap-4 bg-ink px-5 py-5 text-white sm:px-8">
            <div>
              <p className="text-[12px] font-extrabold uppercase tracking-[0.16em] text-gold">Al Paninos catering order</p>
              <p className="mt-1 text-[15px] text-stone-300">Fill it in, watch your total, send it straight to the store.</p>
            </div>
            <Image src="/logo.jpg" alt="" width={52} height={52} className="hidden size-[52px] shrink-0 -rotate-6 rounded-full ring-2 ring-gold/60 sm:block" />
          </div>
          <div className="divide-y divide-stone-200">
            {lead && (
              <FormPart title={lead.title} id={lead.id}>
                {lead.node}
              </FormPart>
            )}
            <FormPart title="Pick-up or delivery?">{howWhere}</FormPart>
            <FormPart title="Date and time" id="when">
              {whenBlock}
            </FormPart>
            <FormPart title="Dietary needs and notes" id="catering-details">
              {cateringBlock}
            </FormPart>
            <FormPart title="Your details" id="details">
              {detailsBlock}
            </FormPart>
            <FormPart title="Order updates" id="updates">
              {updatesBlock}
            </FormPart>
          </div>
        </div>
        <div className="mt-6">{summary}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6 lg:pt-12">
      <Link href={`/menu?store=${c.storeId}&mode=${c.mode}`} className="inline-flex items-center gap-1.5 text-[14px] font-bold text-stone-600 hover:text-brand">
        <ArrowLeft className="size-4" aria-hidden />
        Keep browsing
      </Link>
      <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">Checkout</h1>

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-5">
          {lead && (
            <Section n={++n} title={lead.title} id={lead.id}>
              {lead.node}
            </Section>
          )}

          {/* How and where */}
          <Section n={++n} title={isCatering ? "Catering pickup or delivery" : "Pickup or delivery"}>
            {howWhere}
          </Section>

          {/* 2. When */}
          <Section n={++n} title={isCatering ? "When do you need it?" : c.mode === "delivery" ? "When should it arrive?" : "When will you pick it up?"} id="when">
            {whenBlock}
          </Section>

          {/* 3. Who */}
          <Section n={++n} title="Your details" id="details">
            {detailsBlock}
          </Section>

          {/* Catering details */}
          {isCatering && (
            <Section n={++n} title="Dietary needs and notes" id="catering-details">
              {cateringBlock}
            </Section>
          )}

          {/* Updates */}
          <Section n={++n} title="Order updates" id="updates">
            {updatesBlock}
          </Section>

          {/* Deals */}
          <Section n={++n} title="Deals and codes">
            {dealsBlock}
          </Section>
        </div>

        {/* Summary */}
        {summary}
      </div>
    </div>
  );
}
