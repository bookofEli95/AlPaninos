import { useEffect } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { supabase } from './supabase';
import { Alert } from './alert';
import { useAuthStore } from '../store/authStore';

// The birthday treat (the referrals_and_birthdays migration): saved once as
// a month and day; a free Mob sandwich shows up in Deals from 3 days before
// the birthday and is good until 7 days after.
export const BIRTHDAY_TREAT = 'a free Mob sandwich';

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Days in a month -- February allows the 29th.
export function daysInMonth(month: number): number {
  return new Date(2000, month, 0).getDate();
}

export function formatBirthday(month?: number | null, day?: number | null): string | null {
  if (!month || !day) return null;
  return `${MONTH_NAMES[month - 1]} ${day}`;
}

// Saved within a week of the birthday (either side), this year's treat
// won't come -- the server wants a week's notice (claim_birthday_reward).
export function tooCloseForThisYear(month: number, day: number): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const year of [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1]) {
    const birthday = new Date(year, month - 1, Math.min(day, new Date(year, month, 0).getDate()));
    const days = Math.round((birthday.getTime() - today.getTime()) / 86400000);
    if (days >= -7 && days <= 7) return true;
  }
  return false;
}

// When the app opens (and each time it comes back to the front), asks the
// server whether it's time for this customer's birthday treat. The server
// only ever gives it once a year, so asking often is harmless; the one
// time it's given, the customer hears about it right away.
export function useBirthdayTreat() {
  const queryClient = useQueryClient();
  const session = useAuthStore((state) => state.session);
  const userId = session?.user?.id;
  const isAnonymous = session?.user?.is_anonymous ?? false;

  useEffect(() => {
    if (!userId || isAnonymous) return;
    let busy = false;
    const check = async () => {
      if (busy) return;
      busy = true;
      try {
        const { data, error } = await (supabase as any).rpc('claim_birthday_reward');
        if (error || !data?.granted) return;
        queryClient.invalidateQueries({ queryKey: ['promotions'] });
        queryClient.invalidateQueries({ queryKey: ['tabBadge'] });
        queryClient.invalidateQueries({ queryKey: ['birthdayPromo', userId] });
        const { data: profile } = await (supabase as any)
          .from('profiles')
          .select('first_name')
          .eq('id', userId)
          .maybeSingle();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert(
          `Happy Birthday${profile?.first_name ? `, ${profile.first_name}` : ''}! 🎂`,
          `Your birthday treat is here: ${BIRTHDAY_TREAT}, on us. It's waiting in Deals for the next week.`,
          [
            { text: 'Later', style: 'cancel' },
            { text: 'See My Treat', onPress: () => router.push('/(main)/deals') },
          ]
        );
      } catch {
        // No connection -- it'll be checked again next time.
      } finally {
        busy = false;
      }
    };

    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [userId, isAnonymous, queryClient]);
}
