import { create } from 'zustand';
import { Session } from '@supabase/supabase-js';
import { useCartStore } from './cartStore';
import { usePromoStore } from './promoStore';
import { useNavStore } from './navStore';
import { useLocationStore } from './locationStore';

interface AuthState {
  session: Session | null;
  isInitialized: boolean;
  setSession: (session: Session | null) => void;
  setInitialized: (isInitialized: boolean) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  isInitialized: false,
  setSession: (session) => {
    const previousUserId = get().session?.user?.id ?? null;
    const nextUserId = session?.user?.id ?? null;
    useCartStore.getState().setActiveUser(nextUserId ?? 'guest');
    // An applied promo belongs to whoever applied it -- it can be their
    // personal wheel prize -- so it never carries over into a different
    // account (e.g. signing out and continuing as a guest). Token refreshes
    // and the guest -> account upgrade keep the same user id, so they keep it.
    if (previousUserId !== nextUserId) {
      usePromoStore.getState().setAppliedPromo(null);
      // Someone new (or signed out): they start on Home, with the first tab
      // back to "Home" until they pick Pickup or Delivery.
      useNavStore.getState().setOrderStarted(false);
      // ...and at their nearest store, not whichever was used last.
      useLocationStore.getState().resetSessionPick();
    }
    set({ session });
  },
  setInitialized: (isInitialized) => set({ isInitialized }),
}));
