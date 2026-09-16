import { create } from 'zustand';
import { Session } from '@supabase/supabase-js';
import { useCartStore } from './cartStore';

interface AuthState {
  session: Session | null;
  isInitialized: boolean;
  setSession: (session: Session | null) => void;
  setInitialized: (isInitialized: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  isInitialized: false,
  setSession: (session) => {
    useCartStore.getState().setActiveUser(session?.user?.id ?? 'guest');
    set({ session });
  },
  setInitialized: (isInitialized) => set({ isInitialized }),
}));