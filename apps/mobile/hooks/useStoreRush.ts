import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// How many extra minutes a store needs right now because it's busy (the
// checkout_and_loyalty_upgrades migration's get_store_rush: every 3 orders
// from the last 20 minutes that aren't ready yet add 5, up to 20). Added to
// every pickup/delivery time (lib/orderTiming). 0 if it can't be checked.
export function useStoreRush(locationId: string | null | undefined): number {
  const { data } = useQuery({
    queryKey: ['storeRush', locationId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_store_rush', { p_location_id: locationId });
      if (error) throw error;
      return Number(data?.extra_minutes) || 0;
    },
    enabled: !!locationId,
    staleTime: 30000,
    refetchInterval: 60000,
  });
  return data ?? 0;
}
