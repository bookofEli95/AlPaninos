import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { WeekHours } from '../lib/hours';

export type LocationDetails = {
  name: string;
  taxRate: number;
  hours: WeekHours | null;
};

// Cart and any other per-location screen used to each run their own
// useEffect + direct Supabase call for this (see cart.tsx's old version) --
// a plain query hook gets caching and background revalidation for free, so
// re-opening the cart on the same location doesn't re-fetch tax rate/hours
// it already has.
export function useLocationDetails(locationId: string | null) {
  return useQuery({
    queryKey: ['locationDetails', locationId],
    queryFn: async (): Promise<LocationDetails> => {
      const { data, error } = await (supabase as any)
        .from('locations')
        .select('name, tax_rate, hours')
        .eq('id', locationId)
        .single();
      if (error) throw error;
      return {
        name: data.name,
        taxRate: Number(data.tax_rate),
        hours: data.hours ?? null,
      };
    },
    enabled: !!locationId,
  });
}
