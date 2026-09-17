import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Image, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useCartStore } from '../../store/cartStore';
import SkeletonBox from '../../components/Skeleton';
import { useLocationStore } from '../../store/locationStore';
import { reorderUsualItem } from '../../lib/reorder';

export default function Home() {
  const router = useRouter();
  const { session, setSession } = useAuthStore();
  const isAnonymous = session?.user?.is_anonymous ?? false;
  const { deliveryAddress, setDeliveryAddress } = useCartStore();
  const setLocationId = useLocationStore(state => state.setLocationId);
  const [addingUsual, setAddingUsual] = useState(false);

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

  return (
    <View className="flex-1 bg-[#FAF6F0] px-4 pt-16">
      {/* Header aligned to pt-16 mb-6 */}
      <View style={styles.headerContainer}>
        <Text className="text-3xl font-extrabold text-[#1C1917]">Select a Location</Text>
        <TouchableOpacity
          onPress={handleSignOut}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          activeOpacity={0.6}
          style={styles.signOutButton}
        >
          <Text className="text-[#A61C14] font-bold text-base">Sign Out</Text>
        </TouchableOpacity>
      </View>

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
            <Text className="text-xs font-bold uppercase text-[#A61C14] tracking-wider mb-1">Your Usual</Text>
            <Text className="text-lg font-bold text-[#1C1917]" numberOfLines={1}>{usualItem.name}</Text>
            <Text className="text-[#78716C] text-sm">Ordered {usualItem.times_ordered}+ times</Text>
          </View>
          <View className="bg-[#A61C14] px-4 py-2.5 rounded-xl items-center justify-center" style={{ minWidth: 64 }}>
            {addingUsual ? (
              <ActivityIndicator color="#F4ECE1" size="small" />
            ) : (
              <Text className="text-[#F4ECE1] font-bold text-sm">Add</Text>
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
          <Text className="text-[#A61C14] font-bold text-lg mb-2">Couldn't load locations</Text>
          <Text className="text-[#78716C] text-center">{(locationsError as Error).message}</Text>
        </View>
      ) : (
        <FlatList
          data={locations}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => {
                setLocationId(item.id);
                router.replace(`/(main)/menu/${item.id}`);
              }}
              className="bg-white p-6 rounded-2xl mb-4 border border-stone-200 shadow-sm"
            >
              <Text className="text-xl font-bold text-[#1C1917]">{item.name}</Text>
              <Text className="text-[#78716C] mt-1">{item.address}</Text>
            </TouchableOpacity>
          )}
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
