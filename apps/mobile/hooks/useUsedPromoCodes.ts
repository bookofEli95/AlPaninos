import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

// The promo codes this customer has already used on an order (lower-case),
// read straight off orders.promo_code -- the exact record of what they've
// redeemed. One query (and cache) for everywhere a deal is shown, so a
// used-up deal is never advertised as available: Deals, the cart's deals
// list, the Menu's deal tags and a category's deal banner. Checkout
// refreshes it (cart.tsx invalidates ['usedPromoCodes']).
export function useUsedPromoCodes() {
  const userId = useAuthStore((state) => state.session?.user?.id);
  return useQuery({
    queryKey: ['usedPromoCodes', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('promo_code')
        .eq('user_id', userId!)
        .not('promo_code', 'is', null);
      if (error) throw error;
      return new Set((data || []).map((o: any) => String(o.promo_code).toLowerCase()));
    },
    enabled: !!userId,
  });
}

export { isPromoUsed } from '../lib/promoUsage';
