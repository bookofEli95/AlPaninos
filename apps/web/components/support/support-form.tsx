"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Heart, Loader2, MessageCircle, PackageX, Timer, UtensilsCrossed, Users } from "lucide-react";
import { browserSupabase, ensureSession, useSession } from "@/lib/browser-supabase";
import { formatDayAndTime } from "@/lib/ordering/timing";
import { money } from "@/lib/format";

// The app's topics (customer_feedback.topic), each with a prompt for the
// details that matter -- plus Catering for questions before ordering.
const TOPICS = [
  { label: "Food Quality", Icon: UtensilsCrossed, prompt: "Which item was it, and what was wrong?" },
  { label: "Missing Item", Icon: PackageX, prompt: "What was missing from your order?" },
  { label: "Order Speed", Icon: Timer, prompt: "How long did it take, and what happened?" },
  { label: "Catering", Icon: Users, prompt: "What's the occasion, how many people, and when?" },
  { label: "Compliment", Icon: Heart, prompt: "What did you love? We'll pass it on to the team." },
  { label: "Other", Icon: MessageCircle, prompt: "Tell us what's on your mind..." },
];

type RecentOrder = { id: string; created_at: string; total_amount: number; order_items: { quantity: number; menu_items: { name: string } | null }[] };

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

// Customer Support: a message to the team, optionally about one of their
// orders, saved the same way as the app's (customer_feedback). Guests leave
// an email so the team can write back.
export default function SupportForm({ orderId, topic: initialTopic }: { orderId: string | null; topic: string | null }) {
  const { ready, user, isMember } = useSession();
  const [topic, setTopic] = useState<string | null>(TOPICS.some((t) => t.label === initialTopic) ? initialTopic : null);
  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(orderId);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!user) return;
    browserSupabase()
      .from("orders")
      .select("id, created_at, total_amount, order_items ( quantity, menu_items ( name ) )")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => setOrders((data as unknown as RecentOrder[]) ?? []));
  }, [user]);

  const accountEmail = isMember ? user?.email ?? "" : "";
  const replyTo = accountEmail || email.trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (message.trim().length < 3) return setError("Tell us a little more so we can help.");
    if (!accountEmail && email.trim() && !isValidEmail(email)) return setError("Check your email address, or leave it blank.");
    setBusy(true);
    try {
      const session = await ensureSession();
      const body = !accountEmail && email.trim() ? `${message.trim()}\n\nReply to: ${email.trim()}` : message.trim();
      const { error: insertError } = await browserSupabase()
        .from("customer_feedback")
        .insert({ user_id: session.user.id, message: body, ...(topic ? { topic } : {}), ...(selectedOrder ? { order_id: selectedOrder } : {}) });
      if (insertError) throw insertError;
      setSent(true);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send your message. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-stone-200">
        <CheckCircle2 className="mx-auto size-12 text-emerald-600" aria-hidden />
        <h2 className="mt-4 font-display text-3xl font-extrabold text-ink">Thanks, we&apos;ve got it.</h2>
        <p className="mt-2 text-stone-600">{replyTo ? `The team will reply to ${replyTo}.` : "The team reads every message."} If it&apos;s about an order happening right now, a call to the store is fastest.</p>
        <button type="button" onClick={() => setSent(false)} className="mt-6 text-[14px] font-bold text-brand hover:underline">
          Send another message
        </button>
      </div>
    );
  }

  const prompt = TOPICS.find((t) => t.label === topic)?.prompt ?? "How can we help?";

  return (
    <form onSubmit={submit} className="rounded-2xl bg-white p-6 ring-1 ring-stone-200 sm:p-8">
      <fieldset>
        <legend className="text-[17px] font-extrabold text-ink">What&apos;s it about?</legend>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TOPICS.map(({ label, Icon }) => {
            const on = topic === label;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setTopic(on ? null : label)}
                aria-pressed={on}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-3 text-left text-[14px] font-semibold ring-1 transition ${on ? "bg-brand text-white ring-brand" : "bg-white text-ink ring-stone-200 hover:ring-stone-400"}`}
              >
                <Icon className={`size-4 shrink-0 ${on ? "text-gold" : "text-brand"}`} aria-hidden />
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {ready && orders.length > 0 && (
        <fieldset className="mt-6">
          <legend className="text-[17px] font-extrabold text-ink">Which order? <span className="text-[14px] font-medium text-stone-500">(optional)</span></legend>
          <div className="mt-3 space-y-2">
            {orders.map((o) => {
              const on = selectedOrder === o.id;
              return (
                <label key={o.id} className={`flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 ring-1 ${on ? "ring-2 ring-brand" : "ring-stone-200"}`}>
                  <input type="radio" name="order" checked={on} onChange={() => setSelectedOrder(o.id)} onClick={() => on && setSelectedOrder(null)} className="size-4 accent-[#a61c14]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold text-ink">
                      {formatDayAndTime(new Date(o.created_at)).replace(/^at /, "Today at ")} · {money(o.total_amount)}
                    </span>
                    <span className="block truncate text-[13px] text-stone-500">{o.order_items.map((i) => i.menu_items?.name).filter(Boolean).join(", ")}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <label className="mt-6 block">
        <span className="text-[17px] font-extrabold text-ink">Your message</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
          rows={5}
          placeholder={prompt}
          className="mt-3 w-full resize-y rounded-xl border border-stone-300 px-4 py-3 text-[15px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
        />
      </label>

      {!accountEmail && (
        <label className="mt-4 block">
          <span className="text-xs font-bold uppercase tracking-wide text-stone-500">Your email, so we can reply</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="mt-1.5 w-full rounded-lg border border-stone-300 px-3.5 py-3 text-[15px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
          />
        </label>
      )}

      {error && (
        <p className="mt-4 text-[14px] font-medium text-brand" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-4 text-[15px] font-extrabold uppercase tracking-wide text-white hover:bg-brand-dark disabled:opacity-60">
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
        Send Message
      </button>
      {!isMember && (
        <p className="mt-4 text-center text-[13px] text-stone-500">
          Ordered with an account?{" "}
          <Link href="/signin?next=/support" className="font-bold text-brand hover:underline">
            Sign in
          </Link>{" "}
          to pick the order.
        </p>
      )}
    </form>
  );
}
