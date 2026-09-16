import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useLocationStore } from '../../store/locationStore';
import { useRouter } from 'expo-router';
import SkeletonBox from '../../components/Skeleton';
import { reorderFromOrder } from '../../lib/reorder';

const STATUS_CONFIG: Record<string, { bg: string; text: string }> = {
  received: { bg: 'bg-amber-100', text: 'text-amber-800' },
  preparing: { bg: 'bg-orange-100', text: 'text-orange-800' },
  out_for_delivery: { bg: 'bg-indigo-100', text: 'text-indigo-800' },
  ready: { bg: 'bg-emerald-100', text: 'text-emerald-800' },
  completed: { bg: 'bg-stone-200', text: 'text-stone-800' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-800' },
};

export default function OrdersScreen() {
  const { session } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();
  const locationId = useLocationStore(state => state.locationId);
  const isAnonymous = session?.user?.is_anonymous ?? false;
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  const handleReorder = async (orderId: string) => {
    setReorderingId(orderId);
    try {
      const { skippedCount } = await reorderFromOrder(orderId);
      if (skippedCount > 0) {
        Alert.alert(
          'Some items unavailable',
          `${skippedCount} item(s) from this order are no longer available and were left out.`
        );
      }
      router.push('/(main)/cart');
    } catch (e: any) {
      Alert.alert('Couldn\'t reorder', e.message);
    } finally {
      setReorderingId(null);
    }
  };

  // Hidden from guests' tab bar, but the route itself is still reachable
  // (e.g. an OS back gesture) -- guest order history isn't reliable enough
  // to show (tied to a throwaway anonymous session), so bounce them out.
  useEffect(() => {
    if (isAnonymous) {
      router.replace(locationId ? `/(main)/menu/${locationId}` : '/(main)');
    }
  }, [isAnonymous]);

  const { data: orders, isLoading, error } = useQuery({
    queryKey: ['orders', session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) return [];
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      return data;
    },
    enabled: !!session?.user?.id,
  });

  useEffect(() => {
    if (!session?.user?.id) return;

    const channel = supabase
      .channel('orders-list-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `user_id=eq.${session.user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['orders', session?.user?.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, queryClient]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-[#FAF6F0] pt-16 px-4">
        <SkeletonBox width={160} height={30} style={{ marginBottom: 24 }} />
        {[1, 2, 3].map(i => (
          <View key={i} className="bg-white p-5 rounded-2xl mb-4 border border-stone-200">
            <View className="flex-row justify-between items-center mb-3">
              <SkeletonBox width={120} height={18} />
              <SkeletonBox width={70} height={22} borderRadius={12} />
            </View>
            <View className="flex-row justify-between items-center">
              <SkeletonBox width={80} height={14} />
              <SkeletonBox width={60} height={18} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-[#FAF6F0] justify-center items-center px-6">
        <Text className="text-[#A61C14] font-bold text-lg mb-2">Couldn't load your orders</Text>
        <Text className="text-[#78716C] text-center">{(error as Error).message}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-16 px-4">
      <Text className="text-3xl font-extrabold text-[#1C1917] mb-6">Your Orders</Text>
      
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const badge = STATUS_CONFIG[item.status] || { bg: 'bg-stone-100', text: 'text-stone-800' };

          return (
            <TouchableOpacity
              onPress={() => router.push(`/(main)/order/${item.id}`)}
              className="bg-white p-6 rounded-2xl mb-5 border border-stone-200 shadow-sm"
            >
              <View className="flex-row justify-between items-center mb-2">
                <Text className="font-bold text-lg text-[#1C1917]">Order #{item.id.slice(0, 8)}</Text>
                {item.status && (
                  <View className={`${badge.bg} px-3 py-1 rounded-full`}>
                    <Text className={`${badge.text} font-semibold capitalize text-xs`}>{item.status}</Text>
                  </View>
                )}
              </View>
              <View className="flex-row justify-between items-center mt-2 mb-4">
                <Text className="text-[#78716C]">
                  {new Date(item.created_at).toLocaleDateString()}
                </Text>
                <Text className="font-bold text-lg text-[#A61C14]">${Number(item.total_amount).toFixed(2)}</Text>
              </View>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  handleReorder(item.id);
                }}
                disabled={reorderingId === item.id}
                className="bg-[#1C1917] py-3.5 rounded-xl items-center active:opacity-90 mt-2"
              >
                {reorderingId === item.id ? (
                  <ActivityIndicator size="small" color="#F4ECE1" />
                ) : (
                  <Text className="text-[#F4ECE1] font-bold text-sm">Reorder</Text>
                )}
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <Text className="text-center text-[#78716C] mt-10 text-base">No past orders found.</Text>
        }
      />
    </View>
  );
}