import { Share } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuthStore } from '../store/authStore';

// Give $5, Get $5 (the referrals_and_birthdays migration): a friend enters
// the customer's code in the cart's promo box for $5 off their first order
// of $15+, and the customer gets $5 off too once that order is picked up.
export const REFERRAL_AMOUNT = 5;
export const REFERRAL_MIN_ORDER = 15;

// The app's store link, once it's live -- added to the share message.
const APP_DOWNLOAD_URL: string | null = null;

export type MyReferral = { code: string; friends_joined: number; friends_ordered: number };

// The customer's own code (made the first time it's asked for) and how many
// friends have used it. Accounts only -- guests don't get a code.
export function useMyReferral() {
  const session = useAuthStore((state) => state.session);
  const userId = session?.user?.id;
  const isAnonymous = session?.user?.is_anonymous ?? false;
  return useQuery({
    queryKey: ['referral', userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_my_referral');
      if (error) throw error;
      return data as MyReferral;
    },
    enabled: !!userId && !isAnonymous,
    staleTime: 60000,
  });
}

export function shareReferral(code: string) {
  const message =
    `Get $${REFERRAL_AMOUNT} off your first Al Paninos order! Create a free account in the Al Paninos app ` +
    `and enter my code ${code} at checkout.` +
    (APP_DOWNLOAD_URL ? ` ${APP_DOWNLOAD_URL}` : '');
  return Share.share({ message }).catch(() => {});
}

// A friend's code typed into the promo box: gives this customer their $5
// off and returns it as a promotions row to apply -- or null when it isn't
// anyone's code. Throws with a friendly message when it can't be used
// (their own code, already ordered before, a guest...).
export async function redeemReferralCode(code: string): Promise<any | null> {
  const { data, error } = await (supabase as any).rpc('redeem_referral_code', { p_code: code.trim() });
  if (error) throw error;
  return data ?? null;
}
