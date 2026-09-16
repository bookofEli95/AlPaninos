import React, { useState, useEffect } from 'react';
import { View, TextInput, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

type Props = {
  defaultAddress?: string;
  onAddressSelect: (address: string) => void;
  onFocus?: () => void;
};

export default function AddressAutocomplete({ defaultAddress = '', onAddressSelect, onFocus }: Props) {
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
    onAddressSelect(description);
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Enter delivery address..."
        placeholderTextColor="#9CA3AF"
        value={query}
        onChangeText={searchPlaces}
        onFocus={onFocus}
      />
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
});
