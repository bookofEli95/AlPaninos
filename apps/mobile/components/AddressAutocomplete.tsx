import React, { useState } from 'react';
import { View, TextInput, FlatList, Text, TouchableOpacity } from 'react-native';

type Props = {
  defaultAddress?: string;
  onAddressSelect: (address: string) => void;
};

export default function AddressAutocomplete({ defaultAddress = '', onAddressSelect }: Props) {
  const [query, setQuery] = useState(defaultAddress);
  const [results, setResults] = useState<any[]>([]);
  const API_KEY = 'AIzaSyAFzPHR7X3_eDSIVZeh3N7aDZ7KfPD1OBE';

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
    <View className="z-50 w-full relative">
      <TextInput
        className="bg-gray-100 p-4 rounded-lg text-lg mb-2"
        placeholder="Enter delivery address..."
        value={query}
        onChangeText={searchPlaces}
      />
      {results.length > 0 && (
        <View className="absolute top-16 left-0 right-0 bg-white shadow-xl rounded-lg border border-gray-200 z-50 max-h-60 overflow-hidden">
          <FlatList
            data={results}
            keyboardShouldPersistTaps="handled"
            keyExtractor={item => item.place_id}
            renderItem={({ item }) => (
              <TouchableOpacity 
                className="p-4 border-b border-gray-100"
                onPress={() => handleSelect(item.description)}
              >
                <Text className="text-gray-800 text-base">{item.description}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </View>
  );
}