import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COUNTRIES, Country } from '../lib/countries';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (country: Country) => void;
  keyboardHeight: number;
};

// Same top-anchored overlay pattern as the address popup (see register.tsx)
// -- kept as a full-screen sibling at the screen root rather than a
// self-contained component, so it isn't clipped by whatever small row it's
// triggered from.
export default function CountryPickerSheet({ visible, onClose, onSelect, keyboardHeight }: Props) {
  const [search, setSearch] = useState('');

  if (!visible) return null;

  const query = search.trim().toLowerCase();
  const filtered = query
    ? COUNTRIES.filter(c => c.name.toLowerCase().includes(query) || c.dialCode.includes(query))
    : COUNTRIES;

  const close = () => {
    setSearch('');
    onClose();
  };

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <TouchableOpacity
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        activeOpacity={1}
        onPress={close}
      />
      <View
        className="bg-[#FAF6F0] rounded-2xl mx-4 p-5"
        style={{
          marginTop: 70,
          maxHeight: Dimensions.get('window').height - keyboardHeight - 70 - 40,
        }}
      >
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-xl font-extrabold text-[#1C1917]">Select Country</Text>
          <TouchableOpacity onPress={close} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={26} color="#1C1917" />
          </TouchableOpacity>
        </View>

        <TextInput
          autoFocus
          className="bg-white border border-stone-300 rounded-xl px-4 py-3 mb-3 text-base text-[#1C1917]"
          placeholder="Search country or code..."
          placeholderTextColor="#A8A29E"
          value={search}
          onChangeText={setSearch}
        />

        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {filtered.map(c => (
            <TouchableOpacity
              key={c.code}
              className="flex-row items-center py-3 border-b border-stone-100"
              onPress={() => {
                setSearch('');
                onSelect(c);
              }}
            >
              <Text className="text-xl mr-3">{c.flag}</Text>
              <Text className="flex-1 text-base text-[#1C1917]">{c.name}</Text>
              <Text className="text-[#78716C] font-semibold">+{c.dialCode}</Text>
            </TouchableOpacity>
          ))}
          {filtered.length === 0 && (
            <Text className="text-center text-[#78716C] mt-6">No countries match.</Text>
          )}
        </ScrollView>
      </View>
    </View>
  );
}
