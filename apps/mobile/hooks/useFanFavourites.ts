import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export type FanFavourite = {
  menu_item_id: string;
  name: string;
  image_url: string | null;
  option_ids: string[];
  option_names: string[];
  price: number;
  times_ordered: number;
};

// A store's most-ordered option combos (the fan_favourites migration).
export function useFanFavourites(locationId: string | null | undefined) {
  return useQuery({
    queryKey: ['fanFavourites', locationId],
    queryFn: async (): Promise<FanFavourite[]> => {
      const { data, error } = await (supabase as any).rpc('get_fan_favourites', { p_location_id: locationId, p_limit: 8 });
      if (error) throw error;
      return data || [];
    },
    enabled: !!locationId,
    staleTime: 10 * 60000,
  });
}
