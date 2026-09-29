import { create } from 'zustand';

// Whether the customer has started an order -- picked Pickup or Delivery on
// Home and gone to the menu -- since opening the app or signing in. Until
// then the first tab is "Home" and takes them back to Home; after, it's
// "Menu" ((main)/_layout.tsx). Deliberately not saved: every launch starts
// on Home.
interface NavState {
  orderStarted: boolean;
  setOrderStarted: (started: boolean) => void;
}

export const useNavStore = create<NavState>((set) => ({
  orderStarted: false,
  setOrderStarted: (orderStarted) => set({ orderStarted }),
}));
