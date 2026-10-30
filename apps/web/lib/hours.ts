// Store hours, as the app keeps them (locations.hours): 24h local times per
// day, a missing day meaning closed. The same rules as the app's
// lib/hours.ts, but always on the stores' own clock (Ontario), so a
// visitor's time zone never changes what "Open now" means.
export type DayHours = { open: string; close: string } | null;
export type WeekHours = Partial<Record<(typeof DAY_NAMES)[number], DayHours>>;

export const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const STORE_TIME_ZONE = "America/Toronto";

export function formatTime(time24: string): string {
  const [hStr, mStr] = time24.split(":");
  let h = parseInt(hStr, 10);
  const suffix = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return mStr === "00" ? `${h}${suffix}` : `${h}:${mStr}${suffix}`;
}

const toMinutes = (time24: string) => {
  const [h, m] = time24.split(":").map(Number);
  return h * 60 + m;
};

// The day of the week and minutes past midnight, in Ontario.
export function storeClock(now: Date = new Date()): { dayIndex: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const dayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday").slice(0, 3));
  return { dayIndex, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

// "Open until 9PM", "Opens at 11AM", "Opens tomorrow at 11AM",
// "Opens Monday at 11AM".
export function storeStatus(hours: WeekHours | null | undefined, now: Date = new Date()): { open: boolean; label: string } {
  if (!hours) return { open: false, label: "" };
  const { dayIndex, minutes } = storeClock(now);
  const today = hours[DAY_NAMES[dayIndex]];
  if (today) {
    if (minutes >= toMinutes(today.open) && minutes < toMinutes(today.close)) {
      return { open: true, label: `Open until ${formatTime(today.close)}` };
    }
    if (minutes < toMinutes(today.open)) {
      return { open: false, label: `Opens at ${formatTime(today.open)}` };
    }
  }
  for (let ahead = 1; ahead <= 7; ahead++) {
    const dayName = DAY_NAMES[(dayIndex + ahead) % 7];
    const day = hours[dayName];
    if (day) {
      const when = ahead === 1 ? "tomorrow" : dayName.charAt(0).toUpperCase() + dayName.slice(1);
      return { open: false, label: `Opens ${when} at ${formatTime(day.open)}` };
    }
  }
  return { open: false, label: "Closed" };
}

// The week, Monday first, with runs of identical hours merged:
// "Mon - Tue  11AM - 4PM".
export function weekSummary(hours: WeekHours | null | undefined): { days: string; time: string }[] {
  if (!hours) return [];
  const order = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
  const short = (d: string) => d.charAt(0).toUpperCase() + d.slice(1, 3);
  const rows: { first: string; last: string; time: string }[] = [];
  for (const day of order) {
    const h = hours[day];
    const time = h ? `${formatTime(h.open)} - ${formatTime(h.close)}` : "Closed";
    const prev = rows[rows.length - 1];
    if (prev && prev.time === time) prev.last = day;
    else rows.push({ first: day, last: day, time });
  }
  return rows.map((r) => ({ days: r.first === r.last ? short(r.first) : `${short(r.first)} - ${short(r.last)}`, time: r.time }));
}
