// The home screen's time-of-day mode. 'lunch' until 3 PM, 'evening' after --
// the same split get_daypart_picks() uses to rank items by when they sell.
export type Daypart = 'lunch' | 'evening';

export type DaypartInfo = {
  daypart: Daypart;
  greeting: string;
  title: string;
  subtitle: string;
  icon: 'sunny-outline' | 'partly-sunny-outline' | 'moon-outline';
};

export function getDaypart(now: Date = new Date()): DaypartInfo {
  const hour = now.getHours();
  const weekend = now.getDay() === 0 || now.getDay() === 6;
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const icon = hour < 12 ? 'sunny-outline' : hour < 17 ? 'partly-sunny-outline' : 'moon-outline';

  if (hour < 15) {
    return weekend
      ? { daypart: 'lunch', greeting, icon, title: 'Weekend Lunch', subtitle: 'Hot-pressed favourites' }
      : { daypart: 'lunch', greeting, icon, title: 'Lunch Rush', subtitle: 'Quick favourites for pickup' };
  }
  return weekend
    ? { daypart: 'evening', greeting, icon, title: 'Weekend Sharing', subtitle: 'Loaded fries, salads and desserts' }
    : { daypart: 'evening', greeting, icon, title: 'Tonight', subtitle: 'Loaded fries, salads and desserts to share' };
}
