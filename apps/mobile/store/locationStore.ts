import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const KEY = 'preferredLocationId';

interface LocationState {
  locationId: string | null;
  isLoaded: boolean;
  // Whether the customer picked a store themselves since opening the app
  // (or signing in). Until they do, Home starts them at their nearest
  // store rather than the one saved from last time -- they may be in a
  // different town today.
  pickedThisSession: boolean;
  loadSavedLocation: () => Promise<void>;
  // The customer's own choice (changing store, ordering from a store).
  setLocationId: (id: string) => void;
  // Home's automatic "nearest store" pick -- doesn't count as a choice.
  setNearestLocationId: (id: string) => void;
  resetSessionPick: () => void;
}

export const useLocationStore = create<LocationState>((set) => ({
  locationId: null,
  isLoaded: false,
  pickedThisSession: false,
  loadSavedLocation: async () => {
    const id = await SecureStore.getItemAsync(KEY);
    set({ locationId: id, isLoaded: true });
  },
  setLocationId: (id: string) => {
    SecureStore.setItemAsync(KEY, id);
    set({ locationId: id, pickedThisSession: true });
  },
  setNearestLocationId: (id: string) => {
    SecureStore.setItemAsync(KEY, id);
    set({ locationId: id });
  },
  resetSessionPick: () => set({ pickedThisSession: false }),
}));
