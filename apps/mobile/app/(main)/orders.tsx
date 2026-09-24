import { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useCartStore } from '../../store/cartStore';
import { useLocationStore } from '../../store/locationStore';
import { useRouter, useNavigation } from 'expo-router';
import SkeletonBox from '../../components/Skeleton';
import AccountSetupSheet from '../../components/AccountSetupSheet';
import { useProfile } from '../../hooks/useProfile';
import { reorderFromOrder } from '../../lib/reorder';
import { tabularNums } from '../../lib/typography';

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  received: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Received' },
  preparing: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Preparing' },
  out_for_delivery: { bg: 'bg-indigo-100', text: 'text-indigo-800', label: 'On the Way' },
  ready: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Ready for Pickup' },
  completed: { bg: 'bg-stone-200', text: 'text-stone-800', label: 'Completed' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-800', label: 'Cancelled' },
};

export default function OrdersScreen() {
  const { session } = useAuthStore();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const locationId = useLocationStore((state) => state.locationId);
  const hasCartItems = useCartStore((state) => state.items.length > 0);
  const { data: profile } = useProfile();
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [setupVisible, setSetupVisible] = useState(false);

  // Tab screens stay mounted when you switch away, so a newly placed order
  // wouldn't otherwise show up here until the realtime listener below
  // catches it. This is a backstop for that -- refetch every time this tab
  // is actually looked at, not just when it first mounts.
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      queryClient.invalidateQueries({ queryKey: ['orders', session?.user?.id] });
    });
    return unsubscribe;
  }, [navigation, session?.user?.id, queryClient]);

  const handleReorder = async (orderId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
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

  // A guest can't have orders while still a guest -- checking out verifies
  // their email, which makes it a (password-less) account. Those accounts
  // are the ones with orders to lose: no name (every Sign Up account has
  // one, see profile.tsx's Finish Your Account card) and no password.
  const needsAccountSetup = !!profile && !profile.first_name && !!orders?.length;

  if (isLoading) {
    return (
      <View className="flex-1 bg-[#FAF6F0] pt-14 px-4">
        <SkeletonBox width={140} height={26} style={{ marginBottom: 20 }} />
        {[1, 2, 3].map((i) => (
          <View key={i} className="bg-white p-5 rounded-2xl mb-3 border border-stone-200">
            <View className="flex-row justify-between items-center mb-3">
              <SkeletonBox width={120} height={18} />
              <SkeletonBox width={70} height={20} borderRadius={10} />
            </View>
            <View className="flex-row justify-between items-center">
              <SkeletonBox width={80} height={14} />
              <SkeletonBox width={60} height={16} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-[#FAF6F0] justify-center items-center px-6">
        <Ionicons name="alert-circle-outline" size={36} color="#A61C14" />
        <Text className="text-[#A61C14] font-inter-bold text-base mt-2 mb-1">Couldn't load your orders</Text>
        <Text className="text-stone-500 text-center text-xs">{(error as Error).message}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-14 px-4">
      <Text className="text-2xl font-display-bold text-[#1C1917] tracking-tight mb-3">Your Orders</Text>

      {needsAccountSetup && (
        <View className="bg-white border border-stone-200 rounded-2xl p-3.5 mb-3 shadow-sm flex-row items-center justify-between">
          <View className="flex-row items-center flex-1 mr-2">
            <View className="w-8 h-8 rounded-full bg-[#FAF6F0] items-center justify-center mr-2.5">
              <Ionicons name="shield-checkmark-outline" size={16} color="#A61C14" />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-inter-bold text-[#1C1917]">Keep These Orders</Text>
              <Text className="text-[11px] text-stone-500">
                Set a password to keep these orders and your points.
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => setSetupVisible(true)}
            className="bg-[#A61C14] px-3 py-1.5 rounded-lg active:bg-[#85140E]"
          >
            <Text className="text-[#F4ECE1] font-inter-bold text-[11px]">Save</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        // Room for the floating View Cart bar ((main)/_layout.tsx) so it
        // never covers the last order.
        contentContainerStyle={{ paddingBottom: hasCartItems ? 96 : 32 }}
        renderItem={({ item }) => {
          const badge = STATUS_CONFIG[item.status] || {
            bg: 'bg-stone-100',
            text: 'text-stone-800',
            label: item.status,
          };
          const isFinished = item.status === 'completed' || item.status === 'cancelled';

          return (
            <TouchableOpacity
              onPress={() => router.push(`/(main)/order/${item.id}`)}
              className="bg-white p-4 rounded-2xl mb-3 border border-stone-200 shadow-sm"
              activeOpacity={0.8}
            >
              <View className="flex-row justify-between items-center mb-1.5">
                <View className="flex-row items-center flex-1 mr-2">
                  <Text className="font-inter-bold text-sm text-[#1C1917]">Order #{item.id.slice(0, 8)}</Text>
                  {(item as any).is_catering && (
                    <View className="bg-[#FAF6F0] border border-[#A61C14] px-2 py-0.5 rounded-full ml-2">
                      <Text className="text-[#A61C14] text-[10px] font-inter-bold uppercase">Catering</Text>
                    </View>
                  )}
                </View>

                {item.status && (
                  <View className={`${badge.bg} px-2.5 py-0.5 rounded-full`}>
                    <Text className={`${badge.text} font-inter-semibold text-[11px]`}>{badge.label}</Text>
                  </View>
                )}
              </View>

              <View className="flex-row justify-between items-center mt-1 mb-3">
                <Text className="text-stone-500 text-xs">
                  {new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })} •{' '}
                  {item.order_type === 'delivery' ? 'Delivery' : 'Pickup'}
                </Text>
                <Text className="font-inter-bold text-base text-[#A61C14]" style={tabularNums}>
                  ${Number(item.total_amount).toFixed(2)}
                </Text>
              </View>

              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => router.push(`/(main)/order/${item.id}`)}
                  className="flex-1 bg-stone-100 py-2 rounded-xl items-center active:bg-stone-200"
                >
                  <Text className="text-[#1C1917] font-inter-bold text-xs">
                    {isFinished ? 'View Details' : 'Track Status'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    handleReorder(item.id);
                  }}
                  disabled={reorderingId === item.id}
                  className="flex-1 bg-[#1C1917] py-2 rounded-xl items-center active:opacity-90"
                >
                  {reorderingId === item.id ? (
                    <ActivityIndicator size="small" color="#F4ECE1" />
                  ) : (
                    <Text className="text-[#F4ECE1] font-inter-bold text-xs">Reorder</Text>
                  )}
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View className="items-center justify-center py-20 px-4">
            <View className="w-16 h-16 rounded-full bg-stone-200/60 items-center justify-center mb-3">
              <Ionicons name="receipt-outline" size={30} color="#78716C" />
            </View>
            <Text className="text-base font-inter-bold text-[#1C1917]">No orders yet</Text>
            <Text className="text-xs text-stone-500 text-center mt-1 mb-6">
              When you place an order, live tracking and past receipts will show up here.
            </Text>
            <TouchableOpacity
              onPress={() => router.replace(locationId ? `/(main)/menu/${locationId}` : '/(main)')}
              className="bg-[#A61C14] px-5 py-2.5 rounded-xl active:bg-[#85140E]"
            >
              <Text className="text-[#F4ECE1] font-inter-bold text-xs">Start Your First Order</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <AccountSetupSheet
        visible={setupVisible}
        mode="finish"
        initialValues={{ firstName: profile?.first_name, lastName: profile?.last_name, phone: profile?.phone }}
        onClose={() => setSetupVisible(false)}
        onDone={() => {
          setSetupVisible(false);
          if (profile && !profile.has_spun_wheel) {
            Alert.alert("You're All Set!", 'Your orders and points are saved to your account -- and your welcome spin is waiting.', [
              { text: 'Later', style: 'cancel' },
              { text: 'Spin the Wheel', onPress: () => router.replace('/(main)/spin-wheel') },
            ]);
          } else {
            Alert.alert("You're All Set!", 'Your orders and points are saved -- sign in anytime with your email and password.');
          }
        }}
      />
    </View>
  );
}
