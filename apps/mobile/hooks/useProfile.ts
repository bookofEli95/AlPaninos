import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

export type ProfileData = {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address: string | null;
  panino_points: number | null;
  has_spun_wheel: boolean;
  wheel_prize_title: string | null;
  wheel_prize_code: string | null;
};

// The signed-in customer's full profile row. The one place the
// ['profile', userId] query is defined, so every screen reading it caches the
// same shape -- two screens caching different selects under the same key is
// what once left Profile blank after signup (see deals.tsx's own key).
// Guests (anonymous sessions) have no profile to show, so it stays off.
export function useProfile() {
  const session = useAuthStore((state) => state.session);
  const userId = session?.user?.id;
  const isAnonymous = session?.user?.is_anonymous ?? false;

  return useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await (supabase as any).from('profiles').select('*').eq('id', userId).single();
      if (error) throw error;
      return data as ProfileData;
    },
    enabled: !isAnonymous && !!userId,
  });
}
