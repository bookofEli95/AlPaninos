import { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useRouter, useNavigation } from 'expo-router';
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
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      queryClient.invalidateQueries({ queryKey: ['orders', session?.user?.id] });
    });
    return unsubscribe;
  }, [navigation, session?.user?.id, queryClient]);

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
      Alert.alert("Couldn't reorder", e.message);
    } finally {
      setReorderingId(null);
    }
  };

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
        <SkeletonBox width={160} height={26} style={{ marginBottom: 20 }} />
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
        <Text className="text-[#A61C14] font-inter-bold text-base mb-2">Couldn't load your orders</Text>
        <Text className="text-[#78716C] text-center text-xs">{(error as Error).message}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-16 px-4">
      <Text className="text-2xl font-display-bold text-[#1C1917] tracking-tight mb-4">
        Your Orders
      </Text>
      
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => {
          const badge = STATUS_CONFIG[item.status] || { bg: 'bg-stone-100', text: 'text-stone-800' };

          return (
            <TouchableOpacity
              onPress={() => router.push(`/(main)/order/${item.id}`)}
              className="bg-white p-5 rounded-2xl mb-4 border border-stone-200 shadow-sm"
            >
              <View className="flex-row justify-between items-center mb-2">
                <Text className="font-inter-bold text-base text-[#1C1917]">Order #{item.id.slice(0, 8)}</Text>
                {item.status && (
                  <View className={`${badge.bg} px-2.5 py-0.5 rounded-full`}>
                    <Text className={`${badge.text} font-inter-semibold capitalize text-xs`}>{item.status}</Text>
                  </View>
                )}
              </View>
              <View className="flex-row justify-between items-center mt-1 mb-3">
                <Text className="text-[#78716C] text-xs">
                  {new Date(item.created_at).toLocaleDateString()}
                </Text>
                <Text className="font-inter-bold text-base text-[#A61C14]">${Number(item.total_amount).toFixed(2)}</Text>
              </View>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  handleReorder(item.id);
                }}
                disabled={reorderingId === item.id}
                className="bg-[#1C1917] py-2.5 rounded-xl items-center active:opacity-90"
              >
                {reorderingId === item.id ? (
                  <ActivityIndicator size="small" color="#F4ECE1" />
                ) : (
                  <Text className="text-[#F4ECE1] font-inter-bold text-xs">Reorder</Text>
                )}
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <Text className="text-center text-[#78716C] mt-10 text-sm font-inter-medium">No past orders found.</Text>
        }
      />
    </View>
  );
}