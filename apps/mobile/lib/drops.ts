// Limited-time drops (see the secret_menu_drops migration). An item with a
// drop window is "upcoming" before it starts (shown, not orderable), "live"
// during it, and "ended" after (hidden). The database enforces the same
// window when the order is placed.
export type DropFields = {
  drop_starts_at?: string | null;
  drop_ends_at?: string | null;
};

export type DropState = 'none' | 'upcoming' | 'live' | 'ended';

export function dropState(item: DropFields, now: number = Date.now()): DropState {
  const starts = item.drop_starts_at ? new Date(item.drop_starts_at).getTime() : null;
  const ends = item.drop_ends_at ? new Date(item.drop_ends_at).getTime() : null;
  if (ends != null && now >= ends) return 'ended';
  if (starts != null && now < starts) return 'upcoming';
  if (starts != null || ends != null) return 'live';
  return 'none';
}

export const isDropOrderable = (item: DropFields, now?: number) => {
  const state = dropState(item, now);
  return state === 'none' || state === 'live';
};

export const isDropVisible = (item: DropFields, now?: number) => dropState(item, now) !== 'ended';

// "2:00 PM" today, "Fri 2:00 PM" this week, "Oct 9, 2:00 PM" further out.
function formatDropTime(date: Date, now: Date): string {
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayDiff = Math.floor((date.getTime() - startOfToday) / 86400000);
  if (dayDiff === 0) return time;
  if (dayDiff === 1) return `tomorrow ${time}`;
  if (dayDiff > 1 && dayDiff < 7) return `${date.toLocaleDateString([], { weekday: 'short' })} ${time}`;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

// "Drops Fri 11:00 AM" / "Live now -- ends 2:00 PM" / "Drop ended"; null for
// a normal item.
export function dropLabel(item: DropFields, now: number = Date.now()): string | null {
  const state = dropState(item, now);
  const nowDate = new Date(now);
  if (state === 'upcoming') return `Drops ${formatDropTime(new Date(item.drop_starts_at!), nowDate)}`;
  if (state === 'live') {
    return item.drop_ends_at
      ? `Live now -- ends ${formatDropTime(new Date(item.drop_ends_at), nowDate)}`
      : 'Live now';
  }
  if (state === 'ended') return 'Drop ended';
  return null;
}
