"use client";

import { useImperativeHandle, useState, type Ref } from "react";
import { Check, CreditCard, FileText, FlaskConical, Store } from "lucide-react";
import { money } from "@/lib/format";
import { TIP_PERCENTS, tipAmount, type PayMethod, type PaymentProvider, type TipChoice } from "@/lib/payments";

// The card boxes. Whatever the card company is, it hands back a one-time
// token for the card (the card number itself never reaches us), or says
// what's wrong with what was typed.
export type CardBoxHandle = { tokenize: () => Promise<{ token: string } | { error: string }> };

// Pretend card for testing (NEXT_PUBLIC_PAYMENTS_PROVIDER=test): no card
// number at all, just what the pretend card should do.
const TEST_CARDS = [
  { token: "test_ok", label: "Goes through" },
  { token: "test_decline", label: "Declined" },
  { token: "test_cvv", label: "Wrong security code" },
  { token: "test_unknown", label: "No answer" },
] as const;

function TestCardBox({ ref }: { ref?: Ref<CardBoxHandle> }) {
  const [token, setToken] = useState<string>("test_ok");
  useImperativeHandle(ref, () => ({ tokenize: async () => ({ token }) }), [token]);
  return (
    <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-4">
      <p className="flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-wide text-amber-900">
        <FlaskConical className="size-4" aria-hidden />
        Test payments: no real card is charged
      </p>
      <fieldset className="mt-3">
        <legend className="text-[13px] text-amber-900">What should the pretend card do?</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {TEST_CARDS.map((t) => (
            <label
              key={t.token}
              className={`flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 text-[14px] font-semibold text-ink ring-1 ${
                token === t.token ? "ring-2 ring-amber-500" : "ring-amber-200"
              }`}
            >
              <input type="radio" name="test-card" value={t.token} checked={token === t.token} onChange={() => setToken(t.token)} className="accent-amber-600" />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

export function CardBox({ provider, ref }: { provider: PaymentProvider; ref?: Ref<CardBoxHandle> }) {
  if (provider === "test") return <TestCardBox ref={ref} />;
  return null;
}

const labelClass = "text-xs font-bold uppercase tracking-wide text-stone-500";

export default function PaymentBlock({
  methods,
  method,
  onMethod,
  mode,
  tip,
  onTip,
  beforeTax,
  provider,
  cardRef,
}: {
  methods: PayMethod[];
  method: PayMethod;
  onMethod: (m: PayMethod) => void;
  mode: "pickup" | "delivery";
  tip: TipChoice;
  onTip: (t: TipChoice) => void;
  // What a tip percentage is worked out on: the order before tax.
  beforeTax: number;
  provider: PaymentProvider | null;
  cardRef: Ref<CardBoxHandle>;
}) {
  const choices = {
    online: { Icon: CreditCard, title: "Pay now by card", note: "Pay securely now, nothing to pay later" },
    in_store: {
      Icon: Store,
      title: mode === "delivery" ? "Pay when it arrives" : "Pay at pickup",
      note: mode === "delivery" ? "Pay when your order is delivered" : "Pay at the counter when you pick it up",
    },
    invoice: { Icon: FileText, title: "Pay by invoice", note: "We call to confirm, then email you an invoice" },
  } as const;

  // Only one way to pay here: just say what it is.
  if (methods.length === 1) {
    const only = choices[methods[0]];
    return (
      <p className="flex items-start gap-3 rounded-xl bg-cream/70 p-4 text-[15px] text-ink ring-1 ring-stone-200">
        <only.Icon className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
        <span>
          <span className="block font-bold">{only.title}</span>
          <span className="block text-[13px] text-stone-500">{only.note}</span>
        </span>
      </p>
    );
  }

  const tipNow = tipAmount(tip, beforeTax);
  const tipButton = (key: string, active: boolean, label: string, sub: string | null, onClick: () => void) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-[52px] flex-col items-center justify-center rounded-lg px-2 py-2 text-center ring-1 transition ${
        active ? "bg-ink text-white ring-ink" : "bg-white text-ink ring-stone-300 hover:ring-stone-500"
      }`}
    >
      <span className="text-[14px] font-extrabold">{label}</span>
      {sub && <span className={`text-[12px] tabular-nums ${active ? "text-stone-300" : "text-stone-500"}`}>{sub}</span>}
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="How would you like to pay?">
        {methods.map((m) => {
          const ch = choices[m];
          const on = method === m;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onMethod(m)}
              className={`flex items-start gap-3 rounded-xl p-4 text-left ring-1 transition ${on ? "ring-2 ring-brand" : "ring-stone-200 hover:ring-stone-400"}`}
            >
              <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${on ? "border-brand bg-brand" : "border-stone-300"}`} aria-hidden>
                {on && <Check className="size-3.5 text-white" strokeWidth={3} />}
              </span>
              <span>
                <span className="flex items-center gap-2 text-[15px] font-bold text-ink">
                  <ch.Icon className="size-4 text-brand" aria-hidden />
                  {ch.title}
                </span>
                <span className="mt-0.5 block text-[13px] text-stone-500">{ch.note}</span>
              </span>
            </button>
          );
        })}
      </div>

      {method === "online" && (
        <>
          <div>
            <p className={labelClass} id="tip-label">
              Add a tip
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6" role="group" aria-labelledby="tip-label">
              {tipButton("none", tip.kind === "none", "No tip", null, () => onTip({ kind: "none" }))}
              {TIP_PERCENTS.map((p) =>
                tipButton(String(p), tip.kind === "percent" && tip.percent === p, `${p}%`, money(tipAmount({ kind: "percent", percent: p }, beforeTax)), () =>
                  onTip({ kind: "percent", percent: p })
                )
              )}
              {tipButton("custom", tip.kind === "custom", "Other", tip.kind === "custom" && tipNow > 0 ? money(tipNow) : null, () =>
                onTip({ kind: "custom", amount: tip.kind === "custom" ? tip.amount : "" })
              )}
            </div>
            {tip.kind === "custom" && (
              <label className="mt-3 block max-w-[220px]">
                <span className="sr-only">Tip amount</span>
                <span className="relative block">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] font-bold text-stone-500">$</span>
                  <input
                    inputMode="decimal"
                    autoFocus
                    value={tip.amount}
                    onChange={(e) => onTip({ kind: "custom", amount: e.target.value.replace(/[^0-9.]/g, "").slice(0, 7) })}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-stone-300 bg-white py-3 pl-8 pr-3.5 text-[15px] text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
                  />
                </span>
              </label>
            )}
          </div>

          <div id="card">
            <p className={labelClass}>Card</p>
            <div className="mt-2">{provider && <CardBox provider={provider} ref={cardRef} />}</div>
          </div>
        </>
      )}
    </div>
  );
}
