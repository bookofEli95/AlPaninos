import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { Alert } from '../lib/alert';

export type Favourite = { menuItemId: string; name: string; createdAt: string };

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// The customer's hearted items (favourite_items), newest first. An item
// counts as a favourite by its own id or by name -- each store has its own
// copy of every item, and a favourite should follow the customer to
// whichever store they're ordering from.
export function useFavourites() {
  const userId = useAuthStore((state) => state.session?.user?.id);
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['favourites', userId], [userId]);

  const { data: favourites = [] } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('favourite_items')
        .select('menu_item_id, created_at, menu_items ( name )')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((row: any) => ({
        menuItemId: row.menu_item_id,
        name: row.menu_items?.name ?? '',
        createdAt: row.created_at,
      })) as Favourite[];
    },
    enabled: !!userId,
    staleTime: 5 * 60000,
  });

  const matching = useCallback(
    (item: { id: string; name: string }) =>
      favourites.filter((f) => f.menuItemId === item.id || (!!f.name && sameName(f.name, item.name))),
    [favourites]
  );

  const isFavourite = useCallback((item: { id: string; name: string }) => matching(item).length > 0, [matching]);

  // Heart / un-heart. Shown straight away; put back if it can't be saved.
  const toggleFavourite = useCallback(
    async (item: { id: string; name: string }) => {
      if (!userId) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const before = queryClient.getQueryData<Favourite[]>(queryKey) ?? [];
      const existing = matching(item);
      if (existing.length > 0) {
        const ids = existing.map((f) => f.menuItemId);
        queryClient.setQueryData<Favourite[]>(queryKey, before.filter((f) => !ids.includes(f.menuItemId)));
        const { error } = await (supabase as any).from('favourite_items').delete().in('menu_item_id', ids);
        if (error) {
          queryClient.setQueryData(queryKey, before);
          Alert.alert("Couldn't update your favourites", 'Please check your connection and try again.');
        }
      } else {
        queryClient.setQueryData<Favourite[]>(queryKey, [
          { menuItemId: item.id, name: item.name, createdAt: new Date().toISOString() },
          ...before,
        ]);
        const { error } = await (supabase as any)
          .from('favourite_items')
          .upsert({ menu_item_id: item.id }, { onConflict: 'user_id,menu_item_id', ignoreDuplicates: true });
        if (error) {
          queryClient.setQueryData(queryKey, before);
          Alert.alert("Couldn't save your favourite", 'Please check your connection and try again.');
        }
      }
    },
    [userId, queryClient, queryKey, matching]
  );

  return { favourites, isFavourite, toggleFavourite };
}
