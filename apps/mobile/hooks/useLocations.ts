import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// Every store, alphabetical. Shared by the location picker (index.tsx) and
// the More screen's store info -- one hook so the ['locations'] cache key
// always holds the same shape of data no matter which screen fetched it.
export function useLocations() {
  return useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const { data, error } = await supabase.from('locations').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });
}
