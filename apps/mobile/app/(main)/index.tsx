import { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
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

export default function HomeScreen() {
  const router = useRouter();
  const { session } = useAuthStore();
  const isAnonymous = session?.user?.is_anonymous ?? false;
  const { deliveryAddress, setDeliveryAddress, orderType, setOrderType } = useCartStore();
  const setLocationId = useLocationStore((state) => state.setLocationId);

  const [addingUsual, setAddingUsual] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locatingUser, setLocatingUser] = useState(false);

  // Load profile default address for registered users
  useEffect(() => {
    const loadProfile = async () => {
      if (session?.user?.id) {
        const { data, error } = await (supabase as any)
          .from('profiles')
          .select('address')
          .eq('id', session.user.id)
          .single();
        if (!error && data?.address && !deliveryAddress) {
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
    },
  });

  // Reorder Shortcut ("Your Usual") -- only exists once a customer has
  // actually ordered the same item 2+ times (see get_usual_item()), not
  // shown for guests, whose order history isn't something worth building a
  // habit-forming shortcut around.
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
      const { locationId: itemLocationId, skipped } = await reorderUsualItem(
        usualItem.menu_item_id
      );
      if (skipped) {
        Alert.alert('No Longer Available', `${usualItem.name} isn't available right now.`);
        return;
      }
      setLocationId(itemLocationId);
      router.push('/(main)/cart');
    } catch (e: any) {
      Alert.alert("Couldn't add regular item", e.message);
    } finally {
      setAddingUsual(false);
    }
  };

  const handleStartOrder = (locId: string) => {
    setLocationId(locId);
    router.replace(`/(main)/menu/${locId}`);
  };

  const handleUseMyLocation = async () => {
    setLocatingUser(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Needed', 'Enable location access to calculate distance to shops.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      setUserCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
    } catch (e: any) {
      Alert.alert("Couldn't get location", e.message);
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
    <View className="flex-1 bg-[#FAF6F0] pt-14 px-4">
      {/* Top Header */}
      <View className="flex-row items-center justify-between mb-4">
        <View>
          <Text className="text-2xl font-display-bold text-[#1C1917]">Al Paninos</Text>
          <Text className="text-xs text-stone-500 font-inter-medium">
            Artisan Sandwiches & Italian Street Eats
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleUseMyLocation}
          disabled={locatingUser}
          className="bg-white border border-stone-200 px-3 py-1.5 rounded-full flex-row items-center shadow-xs"
        >
          {locatingUser ? (
            <ActivityIndicator size="small" color="#A61C14" />
          ) : (
            <Ionicons name="navigate-outline" size={14} color="#A61C14" />
          )}
          <Text className="text-[#A61C14] font-inter-bold text-xs ml-1">
            {userCoords ? 'Updated' : 'Nearby'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Top Fulfillment Segmented Selector */}
      <View className="bg-stone-200/80 p-1 rounded-2xl flex-row mb-4">
        <TouchableOpacity
          onPress={() => setOrderType('pickup')}
          className={`flex-1 py-2.5 rounded-xl flex-row items-center justify-center ${
            orderType === 'pickup' ? 'bg-white shadow-xs' : ''
          }`}
        >
          <Ionicons
            name="bag-handle-outline"
            size={16}
            color={orderType === 'pickup' ? '#A61C14' : '#78716C'}
          />
          <Text
            className={`font-inter-bold text-xs ml-1.5 ${
              orderType === 'pickup' ? 'text-[#1C1917]' : 'text-stone-500'
            }`}
          >
            Pickup
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setOrderType('delivery')}
          className={`flex-1 py-2.5 rounded-xl flex-row items-center justify-center ${
            orderType === 'delivery' ? 'bg-white shadow-xs' : ''
          }`}
        >
          <Ionicons
            name="bicycle-outline"
            size={16}
            color={orderType === 'delivery' ? '#A61C14' : '#78716C'}
          />
          <Text
            className={`font-inter-bold text-xs ml-1.5 ${
              orderType === 'delivery' ? 'text-[#1C1917]' : 'text-stone-500'
            }`}
          >
            Delivery
          </Text>
        </TouchableOpacity>
      </View>

      {/* 1-Tap Repeat Order Card ("Your Usual") */}
      {usualItem && (
        <TouchableOpacity
          onPress={handleOrderUsual}
          disabled={addingUsual}
          activeOpacity={0.85}
          className="bg-white rounded-2xl border border-stone-200 shadow-xs p-3.5 mb-4 flex-row items-center"
        >
          {usualItem.image_url ? (
            <Image
              source={{ uri: usualItem.image_url }}
              className="w-14 h-14 rounded-xl mr-3 bg-stone-100"
              resizeMode="cover"
            />
          ) : (
            <View className="w-14 h-14 rounded-xl bg-[#FAF6F0] items-center justify-center mr-3">
              <Ionicons name="restaurant" size={22} color="#A61C14" />
            </View>
          )}
          <View className="flex-1 mr-2">
            <Text className="text-[10px] font-inter-bold uppercase tracking-wider text-[#A61C14]">
              Reorder Your Usual
            </Text>
            <Text className="text-base font-inter-bold text-[#1C1917]" numberOfLines={1}>
              {usualItem.name}
            </Text>
            <Text className="text-stone-400 text-xs">
              Ordered {usualItem.times_ordered} times
            </Text>
          </View>
          <View className="bg-[#A61C14] px-3.5 py-2 rounded-xl items-center justify-center">
            {addingUsual ? (
              <ActivityIndicator color="#F4ECE1" size="small" />
            ) : (
              <Text className="text-[#F4ECE1] font-inter-bold text-xs">Reorder</Text>
            )}
          </View>
        </TouchableOpacity>
      )}

      {/* Locations List */}
      <FlatList
        data={sortedLocations}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => {
          const open = isOpenNow(item.hours);

          return (
            <View className="bg-white p-4 rounded-2xl mb-3 border border-stone-200 shadow-xs">
              <View className="flex-row justify-between items-start mb-1">
                <Text className="text-lg font-inter-bold text-[#1C1917] flex-1 mr-2">
                  {item.name}
                </Text>
                {item.distanceKm != null && (
                  <Text className="text-[#A61C14] font-inter-bold text-xs">
                    {item.distanceKm.toFixed(1)} km away
                  </Text>
                )}
              </View>

              <Text className="text-stone-500 text-xs mb-2.5">{item.address}</Text>

              <View className="flex-row items-center justify-between pt-2 border-t border-stone-100">
                <View className="flex-row items-center">
                  <View
                    className={`w-2 h-2 rounded-full mr-1.5 ${
                      open ? 'bg-emerald-500' : 'bg-stone-300'
                    }`}
                  />
                  <Text
                    className={`text-xs font-inter-semibold ${
                      open ? 'text-emerald-700' : 'text-stone-500'
                    }`}
                  >
                    {open ? 'Open' : 'Closed'} • {getTodayHoursLabel(item.hours)}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => handleStartOrder(item.id)}
                  className="bg-[#A61C14] px-4 py-2 rounded-xl flex-row items-center active:bg-[#85140E]"
                >
                  <Text className="text-[#F4ECE1] font-inter-bold text-xs mr-1">
                    {orderType === 'delivery' ? 'Deliver Here' : 'Order Pickup'}
                  </Text>
                  <Ionicons name="arrow-forward" size={12} color="#F4ECE1" />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            <View>
              {[1, 2].map((i) => (
                <SkeletonBox key={i} height={110} borderRadius={16} style={{ marginBottom: 12 }} />
              ))}
            </View>
          ) : locationsError ? (
            <View className="mt-8 items-center px-6">
              <Text className="text-[#A61C14] font-inter-bold text-base mb-1">
                Locations unavailable
              </Text>
              <Text className="text-stone-500 text-center text-xs">
                {(locationsError as Error).message}
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}
