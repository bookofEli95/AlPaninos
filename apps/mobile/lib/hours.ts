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
