import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { callPhone, openDirections } from '../lib/directions';

// The store an order is from, on the order screen: where it is, and one tap
// to call it or get directions (Apple Maps / Google Maps). Call only shows
// once the store has a phone number (locations.phone).
export default function OrderStoreCard({
  location,
  orderType,
}: {
  location: { name?: string | null; address?: string | null; phone?: string | null } | null | undefined;
  orderType: string;
}) {
  if (!location?.name && !location?.address) return null;

  return (
    <View className="bg-white p-4 rounded-3xl border border-stone-200 shadow-sm mb-4">
      <Text className="text-xs font-inter-bold text-[#78716C] uppercase tracking-wider mb-2">
        {orderType === 'delivery' ? 'Coming From' : 'Pick Up At'}
      </Text>
      <View className="flex-row items-start">
        <View className="w-10 h-10 rounded-2xl bg-[#FAF6F0] border border-stone-200 items-center justify-center mr-3">
          <Ionicons name="storefront-outline" size={19} color="#A61C14" />
        </View>
        <View className="flex-1">
          {!!location.name && <Text className="text-base font-inter-bold text-[#1C1917]">Al Paninos {location.name}</Text>}
          {!!location.address && <Text className="text-sm text-[#78716C] mt-0.5">{location.address}</Text>}
          {!!location.phone && <Text className="text-sm text-[#78716C] mt-0.5">{location.phone}</Text>}
        </View>
      </View>

      <View className="flex-row gap-2 mt-3">
        {!!location.phone && (
          <TouchableOpacity
            onPress={() => callPhone(location.phone!)}
            className="flex-1 flex-row items-center justify-center bg-stone-100 py-2.5 rounded-xl active:bg-stone-200"
          >
            <Ionicons name="call-outline" size={15} color="#1C1917" />
            <Text className="text-[#1C1917] font-inter-bold text-xs ml-1.5">Call Store</Text>
          </TouchableOpacity>
        )}
        {!!location.address && (
          <TouchableOpacity
            onPress={() => openDirections(location.address!)}
            className="flex-1 flex-row items-center justify-center bg-stone-100 py-2.5 rounded-xl active:bg-stone-200"
          >
            <Ionicons name="navigate-outline" size={15} color="#1C1917" />
            <Text className="text-[#1C1917] font-inter-bold text-xs ml-1.5">Directions</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
