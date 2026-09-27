import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

// The two tab-bar dots ((main)/_layout.tsx):
//   * Orders -- an order is on its way (received / preparing / ready / out
//     for delivery), kept live by the same realtime updates as the Orders
//     screen. Only orders from the last 12 hours count, so an old test
//     order the kitchen never closed can't leave it on forever.
//   * Deals -- a wheel / PaninoPoints prize the customer hasn't looked at
//     yet. It clears once they open Deals (markPrizesSeen), rather than
//     staying on until the prize is used -- a dot that never goes away
//     stops meaning anything.

const ACTIVE_STATUSES = ['received', 'preparing', 'ready', 'out_for_delivery'];
const SEEN_PRIZES_KEY = 'seenPrizeIds';

export function useTabBadges() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.session?.user?.id);
  const isAnonymous = useAuthStore((state) => state.session?.user?.is_anonymous ?? false);
  const [seenPrizeIds, setSeenPrizeIds] = useState<string[] | null>(null);

  const { data: hasActiveOrder } = useQuery({
    queryKey: ['tabBadge', 'activeOrder', userId],
    queryFn: async () => {
      const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('orders')
        .select('id')
        .eq('user_id', userId!)
        .in('status', ACTIVE_STATUSES as any)
        .gte('created_at', since)
        .limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
    enabled: !!userId,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`tab-badge-orders-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${userId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['tabBadge', 'activeOrder', userId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  // Guests can't win prizes (the wheel and points need an account).
  const { data: prizeIds } = useQuery({
    queryKey: ['tabBadge', 'prizes', userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('promotions')
        .select('id')
        .eq('user_id', userId)
        .eq('is_active', true);
      if (error) throw error;
      return (data || []).map((p: any) => p.id as string);
    },
    enabled: !!userId && !isAnonymous,
    staleTime: 30000,
    refetchInterval: 120000,
  });

  useEffect(() => {
    SecureStore.getItemAsync(SEEN_PRIZES_KEY)
      .then((raw) => setSeenPrizeIds(raw ? JSON.parse(raw) : []))
      .catch(() => setSeenPrizeIds([]));
  }, []);

  const hasNewPrize = !!prizeIds && !!seenPrizeIds && prizeIds.some((id: string) => !seenPrizeIds.includes(id));

  const markPrizesSeen = useCallback(() => {
    if (!prizeIds || !seenPrizeIds) return;
    if (prizeIds.every((id: string) => seenPrizeIds.includes(id))) return;
    // Only keep ids that still exist, so the list can't grow forever.
    setSeenPrizeIds(prizeIds);
    SecureStore.setItemAsync(SEEN_PRIZES_KEY, JSON.stringify(prizeIds)).catch(() => {});
  }, [prizeIds, seenPrizeIds]);

  // Called on every tab change: re-checks anything older than 30 seconds
  // (e.g. a prize just won on the wheel), without refetching on every tap.
  const refreshIfStale = useCallback(() => {
    queryClient.refetchQueries({ queryKey: ['tabBadge'], stale: true, type: 'active' });
  }, [queryClient]);

  return { hasActiveOrder: !!hasActiveOrder, hasNewPrize, markPrizesSeen, refreshIfStale };
}
