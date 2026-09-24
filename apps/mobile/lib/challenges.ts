// Challenges (see the challenges migration): bonus PaninoPoints for
// ordering on certain days or often enough. Progress comes from
// get_my_challenges(); the points are awarded by the database when staff
// complete the order, never by the app.
export type Challenge = {
  id: string;
  title: string;
  description: string | null;
  kind: 'weekdays' | 'order_count';
  period: 'week' | 'month';
  weekdays: number[] | null;
  bonus_points: number;
  min_subtotal: number;
  progress: number;
  target: number;
  done_days: number[];
  completed: boolean;
  period_end: string;
};

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// "Ends Sun, Sep 27". period_end is a plain date (no time zone), so it's
// parsed as a local date rather than UTC midnight.
export function challengeEndsLabel(periodEnd: string): string {
  const [y, m, d] = periodEnd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `Ends ${date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}`;
}
