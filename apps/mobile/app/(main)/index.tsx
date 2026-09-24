import { useCallback, useEffect, useState, useMemo } from 'react';
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
import { useRouter, useFocusEffect } from 'expo-router';
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
import { shadowSm } from '../../lib/shadows';
import { useLocations } from '../../hooks/useLocations';
import { useProfile } from '../../hooks/useProfile';
import { useDrops } from '../../hooks/useDrops';
import { getDaypart } from '../../lib/daypart';
import { dropLabel, dropState } from '../../lib/drops';
import { switchStore } from '../../lib/storeSwitch';

export default function HomeScreen() {
  const router = useRouter();
  const { session } = useAuthStore();
  const isAnonymous = session?.user?.is_anonymous ?? false;
  const { deliveryAddress, setDeliveryAddress, orderType, setOrderType } = useCartStore();
  const setLocationId = useLocationStore((state) => state.setLocationId);
  const storedLocationId = useLocationStore((state) => state.locationId);
  const { data: profile } = useProfile();

  // Re-read the clock whenever Home is shown (it's a tab and stays
  // mounted), so the lunch/evening mode is right when coming back later.
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(useCallback(() => setNow(new Date()), []));
  const daypart = getDaypart(now);

  const [addingUsual, setAddingUsual] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locatingUser, setLocatingUser] = useState(false);

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
  }, [session, deliveryAddress, setDeliveryAddress]);

  const { data: locations, isLoading, error: locationsError } = useLocations();

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
      // The usual is from a particular store; a cart from another store
      // moves over first (asking if anything would be lost).
      const usualStore = locations?.find((l: any) => l.id === usualItem.location_id);
      if (!(await switchStore(usualItem.location_id, usualStore?.name))) return;
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

  const handleStartOrder = async (locId: string) => {
    const store = locations?.find((l: any) => l.id === locId);
    if (!(await switchStore(locId, store?.name))) return;
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

  // Picks and drops are for the store the customer last ordered from, or
  // else the nearest / first one.
  const featuredLocation = useMemo(
    () => sortedLocations.find((l: any) => l.id === storedLocationId) ?? sortedLocations[0] ?? null,
    [sortedLocations, storedLocationId]
  );
  const featuredLocationId = featuredLocation?.id ?? null;

  const { data: picks } = useQuery({
    queryKey: ['daypartPicks', featuredLocationId, daypart.daypart],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_daypart_picks', {
        p_location_id: featuredLocationId,
        p_daypart: daypart.daypart,
        p_limit: 6,
      });
      if (error) throw error;
      return (data || []) as { id: string; name: string; base_price: number; image_url: string | null; location_id: string }[];
    },
    enabled: !!featuredLocationId,
    staleTime: 5 * 60000,
  });

  const { data: drops } = useDrops(featuredLocationId);
  const featuredDrop = drops?.[0] ?? null;

  const openItem = async (itemId: string, itemLocationId: string) => {
    const store = locations?.find((l: any) => l.id === itemLocationId);
    if (!(await switchStore(itemLocationId, store?.name))) return;
    router.push(`/(main)/item/${itemId}`);
  };

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-14 px-4">
      {/* Top Header */}
      <View className="flex-row items-center justify-between mb-4">
        <View>
          <Text className="text-2xl font-display-bold text-[#1C1917] tracking-tight">Al Paninos</Text>
          <View className="flex-row items-center">
            <Ionicons name={daypart.icon} size={12} color="#78716C" />
            <Text className="text-xs text-stone-500 font-inter-medium ml-1">
              {daypart.greeting}
              {profile?.first_name ? `, ${profile.first_name}` : ''}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleUseMyLocation}
          disabled={locatingUser}
          className="bg-white border border-stone-200 px-3 py-1.5 rounded-full flex-row items-center shadow-sm"
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
            orderType === 'pickup' ? 'bg-white' : ''
          }`}
          style={orderType === 'pickup' ? shadowSm : undefined}
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
            orderType === 'delivery' ? 'bg-white' : ''
          }`}
          style={orderType === 'delivery' ? shadowSm : undefined}
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

      {/* 1-Tap Repeat Order Card */}
      {usualItem && (
        <TouchableOpacity
          onPress={handleOrderUsual}
          disabled={addingUsual}
          activeOpacity={0.85}
          className="bg-white rounded-2xl border border-stone-200 shadow-sm p-3.5 mb-4 flex-row items-center"
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
        ListHeaderComponent={
          <>
            {featuredDrop && (
              <TouchableOpacity
                onPress={() => openItem(featuredDrop.id, featuredDrop.location_id)}
                activeOpacity={0.85}
                className="bg-[#1C1917] rounded-2xl p-3.5 mb-4 flex-row items-center"
              >
                {featuredDrop.image_url ? (
                  <Image source={{ uri: featuredDrop.image_url }} className="w-12 h-12 rounded-xl mr-3 bg-stone-700" resizeMode="cover" />
                ) : (
                  <View className="w-12 h-12 rounded-xl mr-3 bg-[#A61C14] items-center justify-center">
                    <Ionicons name="flame" size={22} color="#F4ECE1" />
                  </View>
                )}
                <View className="flex-1 mr-2">
                  <Text className="text-[10px] font-inter-bold uppercase tracking-wider text-[#F0B4AC]">
                    {dropState(featuredDrop) === 'live' ? 'App-Only Drop • Live Now' : 'App-Only Drop'}
                  </Text>
                  <Text className="text-base font-inter-bold text-[#F4ECE1]" numberOfLines={1}>
                    {featuredDrop.name}
                  </Text>
                  <Text className="text-xs text-stone-400" numberOfLines={1}>
                    {dropLabel(featuredDrop)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#F4ECE1" />
              </TouchableOpacity>
            )}

            {!!picks?.length && (
              <View className="mb-4">
                <View className="flex-row items-end justify-between mb-2">
                  <View className="flex-1 mr-2">
                    <Text className="text-base font-inter-bold text-[#1C1917]">{daypart.title}</Text>
                    <Text className="text-xs text-stone-500" numberOfLines={1}>
                      {daypart.subtitle}
                      {featuredLocation?.name ? ` • ${featuredLocation.name}` : ''}
                    </Text>
                  </View>
                </View>
                <FlatList
                  horizontal
                  data={picks}
                  keyExtractor={(pick) => pick.id}
                  showsHorizontalScrollIndicator={false}
                  renderItem={({ item: pick }) => (
                    <TouchableOpacity
                      onPress={() => openItem(pick.id, pick.location_id)}
                      activeOpacity={0.85}
                      className="bg-white rounded-2xl border border-stone-200 mr-2.5 overflow-hidden"
                      style={{ width: 132 }}
                    >
                      {pick.image_url ? (
                        <Image source={{ uri: pick.image_url }} className="w-full h-20 bg-stone-200" resizeMode="cover" />
                      ) : (
                        <View className="w-full h-20 bg-[#FAF6F0] items-center justify-center">
                          <Ionicons name="restaurant" size={22} color="#A8A29E" />
                        </View>
                      )}
                      <View className="p-2.5">
                        <Text className="text-xs font-inter-bold text-[#1C1917]" numberOfLines={1}>
                          {pick.name}
                        </Text>
                        <Text className="text-xs font-inter-bold text-[#A61C14] mt-0.5">
                          ${Number(pick.base_price).toFixed(2)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                />
              </View>
            )}

            {(!!picks?.length || !!featuredDrop) && (
              <Text className="text-base font-inter-bold text-[#1C1917] mb-2">Locations</Text>
            )}
          </>
        }
        renderItem={({ item }) => {
          const open = isOpenNow(item.hours);

          return (
            <View className="bg-white p-4 rounded-2xl mb-3 border border-stone-200 shadow-sm">
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
                    {orderType === 'delivery' ? 'Order Delivery' : 'Order Pickup'}
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