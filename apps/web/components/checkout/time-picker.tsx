"use client";

import { CalendarDays, Clock, Zap } from "lucide-react";
import type { CateringDay } from "@/lib/ordering/catering";
import type { OrderDay } from "@/lib/ordering/timing";

// When the order should be ready: "As soon as possible" or a time today or
// the next days the store is open -- or, for catering, a day on a little
// calendar and a time that day.

export function RegularTimePicker({
  asapAvailable,
  asapMinutes,
  days,
  slot,
  onChange,
  mode,
  openNow,
}: {
  openNow: boolean;
  asapAvailable: boolean;
  asapMinutes: number;
  days: OrderDay[];
  slot: Date | null;
  onChange: (slot: Date | null) => void;
  mode: "pickup" | "delivery";
}) {
  const scheduled = !!slot || !asapAvailable;
  const day = days.find((d) => d.slots.some((s) => s.time.getTime() === slot?.getTime())) ?? days[0];
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={!asapAvailable}
          aria-pressed={!scheduled}
          className={`flex items-start gap-3 rounded-xl p-4 text-left ring-1 transition disabled:cursor-not-allowed disabled:opacity-50 ${
            !scheduled ? "bg-white ring-2 ring-brand" : "bg-white ring-stone-200 hover:ring-stone-400"
          }`}
        >
          <Zap className={`mt-0.5 size-5 ${!scheduled ? "text-brand" : "text-stone-400"}`} aria-hidden />
          <span>
            <span className="block text-[15px] font-bold text-ink">As soon as possible</span>
            <span className="block text-[13px] text-stone-500">
              {asapAvailable
                ? `${mode === "delivery" ? "At your door" : "Ready"} in about ${asapMinutes} min`
                : openNow
                ? "Too close to closing time"
                : "We're closed right now"}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => days[0]?.slots[0] && onChange(slot ?? days[0].slots[0].time)}
          disabled={!days.length}
          aria-pressed={scheduled}
          className={`flex items-start gap-3 rounded-xl p-4 text-left ring-1 transition disabled:opacity-50 ${
            scheduled ? "bg-white ring-2 ring-brand" : "bg-white ring-stone-200 hover:ring-stone-400"
          }`}
        >
          <Clock className={`mt-0.5 size-5 ${scheduled ? "text-brand" : "text-stone-400"}`} aria-hidden />
          <span>
            <span className="block text-[15px] font-bold text-ink">Schedule for later</span>
            <span className="block text-[13px] text-stone-500">Pick a day and time</span>
          </span>
        </button>
      </div>
      {scheduled && day && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-stone-500">Day</span>
            <select
              value={day.key}
              onChange={(e) => onChange(days.find((d) => d.key === e.target.value)?.slots[0]?.time ?? null)}
              className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3.5 py-3 text-[15px] font-semibold outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
            >
              {days.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-stone-500">Time</span>
            <select
              value={slot?.toISOString() ?? day.slots[0]?.time.toISOString()}
              onChange={(e) => onChange(new Date(e.target.value))}
              className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3.5 py-3 text-[15px] font-semibold outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
            >
              {day.slots.map((s) => (
                <option key={s.time.toISOString()} value={s.time.toISOString()}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}

export function CateringTimePicker({ days, slot, onChange }: { days: CateringDay[]; slot: Date | null; onChange: (slot: Date | null) => void }) {
  const selectedDay = days.find((d) => d.slots.some((s) => s.time.getTime() === slot?.getTime())) ?? null;
  return (
    <div>
      <p className="flex items-center gap-2 text-[13px] font-semibold text-stone-500">
        <CalendarDays className="size-4 text-brand" aria-hidden />
        Catering is ordered by 6 PM the day before. Pick the day you need it.
      </p>
      <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
        {days.map((d) => {
          const on = selectedDay?.key === d.key;
          return (
            <button
              key={d.key}
              type="button"
              disabled={d.closed}
              onClick={() => onChange(d.slots[Math.min(2, d.slots.length - 1)]?.time ?? null)}
              aria-pressed={on}
              className={`flex w-[4.5rem] shrink-0 flex-col items-center rounded-xl py-3 ring-1 transition disabled:cursor-not-allowed disabled:bg-stone-50 disabled:opacity-50 ${
                on ? "bg-brand text-white ring-brand" : "bg-white text-ink ring-stone-200 hover:ring-stone-400"
              }`}
            >
              <span className={`text-[11px] font-bold uppercase tracking-wide ${on ? "text-white/80" : "text-stone-500"}`}>{d.weekday}</span>
              <span className="font-display text-2xl font-extrabold leading-tight">{d.dayNumber}</span>
              <span className={`text-[11px] font-semibold ${on ? "text-white/80" : "text-stone-500"}`}>{d.closed ? "Closed" : d.month}</span>
            </button>
          );
        })}
      </div>
      {selectedDay && (
        <label className="mt-3 block sm:max-w-xs">
          <span className="text-xs font-bold uppercase tracking-wide text-stone-500">
            Time on {selectedDay.label} <span className="normal-case">({selectedDay.hoursLabel})</span>
          </span>
          <select
            value={slot?.toISOString()}
            onChange={(e) => onChange(new Date(e.target.value))}
            className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3.5 py-3 text-[15px] font-semibold outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
          >
            {selectedDay.slots.map((s) => (
              <option key={s.time.toISOString()} value={s.time.toISOString()}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
