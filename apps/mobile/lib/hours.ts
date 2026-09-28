export type DayHours = { open: string; close: string } | null;
export type WeekHours = Partial<
  Record<'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday', DayHours>
>;

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

function formatTime(time24: string): string {
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return mStr === '00' ? `${h}${suffix}` : `${h}:${mStr}${suffix}`;
}

export function getTodayHoursLabel(hours: WeekHours | null | undefined): string {
  if (!hours) return '';
  const today = hours[DAY_NAMES[new Date().getDay()]];
  if (!today) return 'Closed today';
  return `${formatTime(today.open)} - ${formatTime(today.close)}`;
}

export function isOpenNow(hours: WeekHours | null | undefined): boolean {
  if (!hours) return false;
  const now = new Date();
  const today = hours[DAY_NAMES[now.getDay()]];
  if (!today) return false;

  const [openH, openM] = today.open.split(':').map(Number);
  const [closeH, closeM] = today.close.split(':').map(Number);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes >= openH * 60 + openM && nowMinutes < closeH * 60 + closeM;
}

const toMinutes = (time24: string) => {
  const [h, m] = time24.split(':').map(Number);
  return h * 60 + m;
};

// A store's status in words for right now: "Open until 9PM", "Opens at
// 11AM" (later today), "Opens tomorrow at 11AM", or "Opens Monday at 11AM".
export function storeStatus(
  hours: WeekHours | null | undefined,
  now: Date = new Date()
): { open: boolean; label: string } {
  if (!hours) return { open: false, label: '' };
  const dayIndex = now.getDay();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const today = hours[DAY_NAMES[dayIndex]];
  if (today) {
    if (nowMinutes >= toMinutes(today.open) && nowMinutes < toMinutes(today.close)) {
      return { open: true, label: `Open until ${formatTime(today.close)}` };
    }
    if (nowMinutes < toMinutes(today.open)) {
      return { open: false, label: `Opens at ${formatTime(today.open)}` };
    }
  }
  for (let ahead = 1; ahead <= 7; ahead++) {
    const dayName = DAY_NAMES[(dayIndex + ahead) % 7];
    const day = hours[dayName];
    if (day) {
      const when = ahead === 1 ? 'tomorrow' : dayName.charAt(0).toUpperCase() + dayName.slice(1);
      return { open: false, label: `Opens ${when} at ${formatTime(day.open)}` };
    }
  }
  return { open: false, label: 'Closed' };
}
