import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { dropState } from '../lib/drops';

export type DropItem = {
  id: string;
  name: string;
  base_price: number;
  image_url: string | null;
  location_id: string;
  drop_starts_at: string | null;
  drop_ends_at: string | null;
};

// A location's current and upcoming drops, live ones first.
export function useDrops(locationId: string | null | undefined) {
  return useQuery({
    queryKey: ['drops', locationId],
    queryFn: async (): Promise<DropItem[]> => {
      const { data, error } = await (supabase as any)
        .from('menu_items')
        .select('id, name, base_price, image_url, location_id, drop_starts_at, drop_ends_at')
        .eq('location_id', locationId)
        .eq('is_available', true)
        .not('drop_starts_at', 'is', null)
        .order('drop_starts_at');
      if (error) throw error;
      const now = Date.now();
      return ((data || []) as DropItem[])
        .filter((d) => dropState(d, now) !== 'ended')
        .sort((a, b) => Number(dropState(b, now) === 'live') - Number(dropState(a, now) === 'live'));
    },
    enabled: !!locationId,
    staleTime: 60000,
  });
}
