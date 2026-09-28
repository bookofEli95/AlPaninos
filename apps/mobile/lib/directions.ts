import { Alert, Linking, Platform } from 'react-native';

// Apple Maps on iOS, Google Maps everywhere else -- each phone's own default
// maps app, opened straight into directions to the store.
export function openDirections(address: string) {
  const destination = encodeURIComponent(address);
  const url =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${destination}`
      : `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
  Linking.openURL(url).catch(() => Alert.alert("Couldn't open maps", 'Please try again.'));
}

// Rings a phone number as written ("519-633-3123", "(548) 866-0420").
export function callPhone(phone: string) {
  const dial = phone.replace(/[^0-9+]/g, '');
  Linking.openURL(`tel:${dial}`).catch(() => Alert.alert("Couldn't start the call", `Please call ${phone}.`));
}
