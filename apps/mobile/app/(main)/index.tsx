import { useEffect, useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Image, ActivityIndicator, Alert } from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useCartStore } from '../../store/cartStore';
import SkeletonBox from '../../components/Skeleton';
import { useLocationStore } from '../../store/locationStore';
import { reorderUsualItem } from '../../lib/reorder';
import { distanceKm } from '../../lib/geo';
import { isOpenNow, getTodayHoursLabel } from '../../lib/hours';

export default function Home() {
  const router = useRouter();
  const { session, setSession } = useAuthStore();
  const isAnonymous = session?.user?.is_anonymous ?? false;
  const { deliveryAddress, setDeliveryAddress, setOrderType } = useCartStore();
  const setLocationId = useLocationStore(state => state.setLocationId);
  const [addingUsual, setAddingUsual] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locatingUser, setLocatingUser] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      if (session?.user?.id) {
        const { data, error } = await (supabase as any)
          .from('profiles')
          .select('address')
          .eq('id', session.user.id)
          .single();
        if (error) {
          console.warn('Failed to load saved address:', error.message);
          return;
        }
        if (data?.address && !deliveryAddress) {
          setDeliveryAddress(data.address);
        }
      }
    };
    loadProfile();
  }, [session]);

  const { data: locations, isLoading, error: locationsError } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const { data, error } = await supabase.from('locations').select('*').order('name');
      if (error) throw error;
      return data;
    }
  });

  // Only exists once a customer has actually ordered the same item 2+ times
  // (see get_usual_item()) -- not shown for guests, whose order history
  // isn't something worth building a habit-forming shortcut around.
  const { data: usualItem } = useQuery({
    queryKey: ['usualItem', session?.user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_usual_item');
      if (error) throw error;
      return data?.[0] ?? null;
    },
    enabled: !isAnonymous && !!session?.user?.id,
  });

  const handleOrderUsual = async () => {
    if (!usualItem) return;
    setAddingUsual(true);
    try {
      const { locationId: itemLocationId, skipped } = await reorderUsualItem(usualItem.menu_item_id);
      if (skipped) {
        Alert.alert('No Longer Available', `${usualItem.name} isn't available right now.`);
        return;
      }
      setLocationId(itemLocationId);
      router.push('/(main)/cart');
    } catch (e: any) {
      Alert.alert("Couldn't add", e.message);
    } finally {
      setAddingUsual(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut().catch(console.warn);
    setSession(null);
    router.replace('/(auth)/login');
  };

  const handleChooseOrderType = (type: 'pickup' | 'delivery') => {
    if (!selectedLocationId) {
      Alert.alert('Select a Location', 'Please choose a location first.');
      return;
    }
    setOrderType(type);
    setLocationId(selectedLocationId);
    router.replace(`/(main)/menu/${selectedLocationId}`);
  };

  const handleUseMyLocation = async () => {
    setLocatingUser(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location Permission Needed', 'Enable location access to find the nearest store.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      setUserCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
    } catch (e: any) {
      Alert.alert("Couldn't get your location", e.message);
    } finally {
      setLocatingUser(false);
    }
  };

  // Locations without lat/lng set (the owner hasn't filled them in via
  // Studio yet) sort to the end rather than being treated as "0km away".
  const sortedLocations = useMemo(() => {
    if (!locations) return [];
    if (!userCoords) return locations;
    return [...locations]
      .map((loc: any) => ({
        ...loc,
        distanceKm:
          loc.latitude != null && loc.longitude != null
            ? distanceKm(userCoords.lat, userCoords.lng, loc.latitude, loc.longitude)
            : null,
      }))
      .sort((a, b) => {
        if (a.distanceKm == null && b.distanceKm == null) return 0;
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return a.distanceKm - b.distanceKm;
      });
  }, [locations, userCoords]);

  return (
    <View className="flex-1 bg-[#FAF6F0] px-4 pt-16">
      {/* Header aligned to pt-16 mb-6 */}
      <View style={styles.headerContainer}>
        <Text className="text-3xl font-display-bold text-[#1C1917]">Select a Location</Text>
        <TouchableOpacity
          onPress={handleSignOut}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          activeOpacity={0.6}
          style={styles.signOutButton}
        >
          <Text className="text-[#A61C14] font-inter-bold text-base">Sign Out</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={handleUseMyLocation}
        disabled={locatingUser}
        className="flex-row items-center self-start bg-white border border-stone-300 rounded-full px-4 py-2 mb-4"
      >
        {locatingUser ? (
          <ActivityIndicator size="small" color="#A61C14" />
        ) : (
          <Ionicons name="locate" size={16} color="#A61C14" />
        )}
        <Text className="text-[#A61C14] font-inter-bold text-sm ml-2">
          {userCoords ? 'Update My Location' : 'Use My Location'}
        </Text>
      </TouchableOpacity>

      {usualItem && (
        <TouchableOpacity
          onPress={handleOrderUsual}
          disabled={addingUsual}
          className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 mb-4 flex-row items-center"
        >
          {usualItem.image_url ? (
            <Image source={{ uri: usualItem.image_url }} className="w-16 h-16 rounded-xl mr-4" resizeMode="cover" />
          ) : (
            <View className="w-16 h-16 rounded-xl bg-[#FAF6F0] items-center justify-center mr-4">
              <Ionicons name="restaurant" size={24} color="#A61C14" />
            </View>
          )}
          <View className="flex-1 mr-2">
            <Text className="text-xs font-inter-bold uppercase text-[#A61C14] tracking-wider mb-1">Your Usual</Text>
            <Text className="text-lg font-inter-bold text-[#1C1917]" numberOfLines={1}>{usualItem.name}</Text>
            <Text className="text-[#78716C] text-sm">Ordered {usualItem.times_ordered}+ times</Text>
          </View>
          <View className="bg-[#A61C14] px-4 py-2.5 rounded-xl items-center justify-center" style={{ minWidth: 64 }}>
            {addingUsual ? (
              <ActivityIndicator color="#F4ECE1" size="small" />
            ) : (
              <Text className="text-[#F4ECE1] font-inter-bold text-sm">Add</Text>
            )}
          </View>
        </TouchableOpacity>
      )}

      {isLoading ? (
        <View>
          {[1, 2].map(i => (
            <SkeletonBox key={i} height={92} borderRadius={16} style={{ marginBottom: 16 }} />
          ))}
        </View>
      ) : locationsError ? (
        <View className="mt-10 items-center px-6">
          <Text className="text-[#A61C14] font-inter-bold text-lg mb-2">Couldn't load locations</Text>
          <Text className="text-[#78716C] text-center">{(locationsError as Error).message}</Text>
        </View>
      ) : (
        <FlatList
          data={sortedLocations}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isSelected = selectedLocationId === item.id;
            return (
              <TouchableOpacity
                onPress={() => setSelectedLocationId(item.id)}
                className={`bg-white p-6 rounded-2xl mb-4 border shadow-sm ${
                  isSelected ? 'border-[#A61C14]' : 'border-stone-200'
                }`}
              >
                <View className="flex-row justify-between items-start">
                  <Text className="text-xl font-inter-bold text-[#1C1917] flex-1 mr-2">{item.name}</Text>
                  {item.distanceKm != null && (
                    <Text className="text-[#A61C14] font-inter-bold text-sm">{item.distanceKm.toFixed(1)} km</Text>
                  )}
                </View>
                <Text className="text-[#78716C] mt-1">{item.address}</Text>
                <View className="flex-row items-center mt-2">
                  <View
                    className={`px-2 py-0.5 rounded-full mr-2 ${isOpenNow(item.hours) ? 'bg-emerald-100' : 'bg-stone-200'}`}
                  >
                    <Text className={`text-xs font-inter-bold ${isOpenNow(item.hours) ? 'text-emerald-800' : 'text-stone-600'}`}>
                      {isOpenNow(item.hours) ? 'Open Now' : 'Closed'}
                    </Text>
                  </View>
                  <Text className="text-[#78716C] text-sm">{getTodayHoursLabel(item.hours)}</Text>
                </View>
                {isSelected && (
                  <View className="flex-row items-center mt-3">
                    <Ionicons name="checkmark-circle" size={16} color="#A61C14" />
                    <Text className="text-[#A61C14] font-inter-bold text-sm ml-1">Selected</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
          ListFooterComponent={
            sortedLocations.length > 0 ? (
              <View className="mt-2 mb-8">
                <Text className="text-lg font-inter-bold text-[#1C1917] mb-3">How would you like to order?</Text>
                <View className="flex-row">
                  <TouchableOpacity
                    onPress={() => handleChooseOrderType('pickup')}
                    className="flex-1 bg-white border border-stone-300 rounded-2xl p-5 items-center mr-2"
                  >
                    <Ionicons name="storefront-outline" size={28} color="#A61C14" />
                    <Text className="text-[#1C1917] font-inter-bold text-base mt-2">Pickup</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleChooseOrderType('delivery')}
                    className="flex-1 bg-white border border-stone-300 rounded-2xl p-5 items-center ml-2"
                  >
                    <Ionicons name="car-outline" size={28} color="#A61C14" />
                    <Text className="text-[#1C1917] font-inter-bold text-base mt-2">Delivery</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24, // Matches Tailwind mb-6 (24px)
    zIndex: 10,
  },
  signOutButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
});
