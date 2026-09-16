import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const KEY = 'preferredLocationId';

interface LocationState {
  locationId: string | null;
  isLoaded: boolean;
  loadSavedLocation: () => Promise<void>;
  setLocationId: (id: string) => void;
}

export const useLocationStore = create<LocationState>((set) => ({
  locationId: null,
  isLoaded: false,
  loadSavedLocation: async () => {
    const id = await SecureStore.getItemAsync(KEY);
    set({ locationId: id, isLoaded: true });
  },
  setLocationId: (id: string) => {
    SecureStore.setItemAsync(KEY, id);
    set({ locationId: id });
  },
}));
