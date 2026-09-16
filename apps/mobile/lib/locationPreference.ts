import * as SecureStore from 'expo-secure-store';

const KEY = 'preferredLocationId';

export const getSavedLocationId = () => SecureStore.getItemAsync(KEY);
export const saveLocationId = (id: string) => SecureStore.setItemAsync(KEY, id);
