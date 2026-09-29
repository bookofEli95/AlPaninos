import React, { useState, useEffect } from 'react';
import {
  View,
  TextInput,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Keyboard,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  defaultAddress?: string;
  onAddressSelect: (address: string) => void;
  onFocus?: () => void;
  autoFocus?: boolean;
  // For an inline field that's pre-filled with an existing address (e.g.
  // switching to delivery reloads your saved address) -- tapping in clears
  // it immediately instead of making them delete it all first. If they tap
  // away without picking a new suggestion, it's restored on blur so it
  // doesn't just look like the address vanished.
  clearOnFocus?: boolean;
};

export default function AddressAutocomplete({
  defaultAddress = '',
  onAddressSelect,
  onFocus,
  autoFocus,
  clearOnFocus,
}: Props) {
  const [query, setQuery] = useState(defaultAddress);
  const [results, setResults] = useState<any[]>([]);

  // defaultAddress is only used to seed the initial value with plain
  // useState -- if it arrives later (e.g. fetched from the profile after
  // this component already mounted with an empty value), that update
  // needs to be picked up explicitly.
  useEffect(() => {
    setQuery(defaultAddress);
  }, [defaultAddress]);
  const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;

  const searchPlaces = async (text: string) => {
    setQuery(text);
    if (text.length < 3) {
      setResults([]);
      return;
    }

    try {
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&components=country:ca&key=${API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === 'OK') {
        setResults(data.predictions);
      } else {
        console.warn('Places API status:', data.status, data.error_message);
      }
    } catch (e) {
      console.warn("Places API error:", e);
    }
  };

  const handleSelect = (description: string) => {
    setQuery(description);
    setResults([]);
    Keyboard.dismiss();
    onAddressSelect(description);
  };

  // "Use my current location": the phone's GPS position, turned into a
  // street address -- by Google (the same format as the typed suggestions)
  // when that works, else by the phone's own maps service.
  const [locating, setLocating] = useState(false);
  const handleUseCurrentLocation = async () => {
    if (locating) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setLocating(true);
    try {
      const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location Access Needed',
          'Allow location access to fill in your address automatically -- or type it in instead.',
          canAskAgain
            ? [{ text: 'OK' }]
            : [
                { text: 'Not Now', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() },
              ]
        );
        return;
      }
      if (!(await Location.hasServicesEnabledAsync())) {
        Alert.alert('Location Is Off', "Turn on your phone's location services, then try again -- or type your address in.");
        return;
      }

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const address = await addressAt(position.coords.latitude, position.coords.longitude, API_KEY);
      if (!address) {
        Alert.alert("Couldn't Find Your Address", "We couldn't find a street address where you are. Please type it in.");
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      handleSelect(address);
    } catch {
      Alert.alert("Couldn't Get Your Location", 'Please try again, or type your address in.');
    } finally {
      setLocating(false);
    }
  };

  const handleFocus = () => {
    if (clearOnFocus) setQuery('');
    onFocus?.();
  };

  const handleBlur = () => {
    if (clearOnFocus && query.trim() === '') setQuery(defaultAddress);
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Enter delivery address..."
        placeholderTextColor="#9CA3AF"
        value={query}
        onChangeText={searchPlaces}
        onFocus={handleFocus}
        onBlur={handleBlur}
        autoFocus={autoFocus}
      />
      <TouchableOpacity
        onPress={handleUseCurrentLocation}
        disabled={locating}
        activeOpacity={0.8}
        style={styles.locateButton}
      >
        {locating ? (
          <ActivityIndicator size="small" color="#A61C14" />
        ) : (
          <Ionicons name="navigate" size={16} color="#A61C14" />
        )}
        <Text style={styles.locateText}>{locating ? 'Finding your address...' : 'Use my current location'}</Text>
      </TouchableOpacity>
      {results.length > 0 && (
        <View style={styles.dropdown}>
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {results.map(item => (
              <TouchableOpacity
                key={item.place_id}
                style={styles.row}
                onPress={() => handleSelect(item.description)}
              >
                <Text style={styles.rowText}>{item.description}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
  },
  input: {
    backgroundColor: '#F3F4F6',
    padding: 16,
    borderRadius: 8,
    fontSize: 18,
    marginBottom: 8,
    color: '#1F2937',
  },
  dropdown: {
    position: 'absolute',
    top: 64,
    left: 0,
    right: 0,
    zIndex: 50,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    maxHeight: 320,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  row: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  rowText: {
    color: '#1F2937',
    fontSize: 16,
  },
  locateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A61C14',
    borderRadius: 8,
    paddingVertical: 12,
    marginBottom: 8,
  },
  locateText: {
    color: '#A61C14',
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    marginLeft: 8,
  },
});

// The street address at a GPS position, or null if there isn't one (e.g.
// the middle of a park). Google's Geocoding API gives the same format as
// the typed suggestions ("123 King St W, Toronto, ON M5H 1A1, Canada");
// if it can't be used (no key, or the API isn't switched on for it), the
// phone's own maps service is asked instead.
// Once Google refuses (the Geocoding API isn't switched on for the key),
// it's skipped for the rest of the session -- quietly, since the phone's
// own maps service does the job.
let googleGeocodingDenied = false;

async function addressAt(latitude: number, longitude: number, apiKey?: string): Promise<string | null> {
  if (apiKey && !googleGeocodingDenied) {
    try {
      const url =
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}` +
        `&result_type=street_address%7Cpremise&key=${apiKey}`;
      const data = await (await fetch(url)).json();
      if (data.status === 'OK' && data.results?.[0]?.formatted_address) return data.results[0].formatted_address;
      if (data.status === 'ZERO_RESULTS') return null;
      if (data.status === 'REQUEST_DENIED') googleGeocodingDenied = true;
    } catch {
      // No connection to Google -- fall through to the phone's maps service.
    }
  }

  const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
  if (!place) return null;
  // Only a real street address (with a house number) is any use for delivery.
  const houseNumber = place.streetNumber ?? place.name?.match(/^\d+\S*/)?.[0] ?? null;
  if (!houseNumber) return null;
  if (place.formattedAddress) return place.formattedAddress;
  const street = place.street ? `${houseNumber} ${place.street}` : place.name;
  return [street, place.city, [place.region, place.postalCode].filter(Boolean).join(' '), place.country]
    .filter(Boolean)
    .join(', ');
}
