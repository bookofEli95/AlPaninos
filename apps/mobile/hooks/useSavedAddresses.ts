import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

export type AddressLabel = 'home' | 'work';
export type SavedAddress = { label: AddressLabel; address: string };

export const ADDRESS_LABELS: AddressLabel[] = ['home', 'work'];
export const ADDRESS_LABEL_NAMES: Record<AddressLabel, string> = { home: 'Home', work: 'Work' };

export const sameAddress = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

// The customer's saved Home and Work addresses (saved_addresses). Accounts
// only -- a guest session doesn't last long enough to be worth saving to.
export function useSavedAddresses() {
  const session = useAuthStore((state) => state.session);
  const userId = session?.user?.id;
  const isAnonymous = session?.user?.is_anonymous ?? false;
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['savedAddresses', userId], [userId]);
  const canSave = !!userId && !isAnonymous;

  const { data: saved = [] } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('saved_addresses').select('label, address');
      if (error) throw error;
      // Home first, then Work.
      return ((data || []) as SavedAddress[]).sort(
        (a, b) => ADDRESS_LABELS.indexOf(a.label) - ADDRESS_LABELS.indexOf(b.label)
      );
    },
    enabled: canSave,
    staleTime: 5 * 60000,
  });

  const save = useCallback(
    async (label: AddressLabel, address: string) => {
      const { error } = await (supabase as any)
        .from('saved_addresses')
        .upsert({ label, address: address.trim(), updated_at: new Date().toISOString() }, { onConflict: 'user_id,label' });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey });
    },
    [queryClient, queryKey]
  );

  const remove = useCallback(
    async (label: AddressLabel) => {
      const { error } = await (supabase as any).from('saved_addresses').delete().eq('label', label);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey });
    },
    [queryClient, queryKey]
  );

  return { saved, canSave, save, remove };
}
