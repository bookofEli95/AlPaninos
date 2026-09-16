import { useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import SkeletonBox from '../../../components/Skeleton';

const DELIVERY_STEPS = [
  { key: 'received', label: 'Received' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'out_for_delivery', label: 'On the Way' },
  { key: 'completed', label: 'Delivered' },
];

const PICKUP_STEPS = [
  { key: 'received', label: 'Received' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready for Pickup' },
  { key: 'completed', label: 'Picked Up' },
];

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams() as { id: string };
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: order, isLoading, error: orderError } = useQuery({
    queryKey: ['order', id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('orders')
        .select(`
          *,
          order_items (
            id,
            quantity,
            unit_price,
            total_price,
            special_instructions,
            menu_items ( name ),
            order_item_modifiers (
              price_adjustment,
              modifier_options ( name )
            )
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Approach A: Realtime listener invalidating React Query cache
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`order-live-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['order', id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-white pt-16 px-4">
        <SkeletonBox width={140} height={26} style={{ marginBottom: 24 }} />
        <SkeletonBox height={140} borderRadius={16} style={{ marginBottom: 24 }} />
        <SkeletonBox height={90} borderRadius={12} style={{ marginBottom: 24 }} />
        <SkeletonBox width={80} height={22} style={{ marginBottom: 16 }} />
        {[1, 2].map(i => (
          <SkeletonBox key={i} height={50} style={{ marginBottom: 16 }} />
        ))}
      </View>
    );
  }

  if (orderError) {
    return (
      <View className="flex-1 bg-white justify-center items-center p-4">
        <Text className="text-red-600 font-bold text-lg mb-2">Couldn't load this order</Text>
        <Text className="text-gray-500 text-center mb-4">{(orderError as Error).message}</Text>
        <TouchableOpacity onPress={() => router.replace('/(main)/orders')}>
          <Text className="text-blue-600 font-bold">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!order) {
    return (
      <View className="flex-1 bg-white justify-center items-center p-4">
        <Text className="text-gray-500 text-lg mb-4">Order not found.</Text>
        <TouchableOpacity onPress={() => router.replace('/(main)/orders')}>
          <Text className="text-blue-600 font-bold">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const steps = order.order_type === 'delivery' ? DELIVERY_STEPS : PICKUP_STEPS;
  const currentStepIndex = steps.findIndex((s) => s.key === order.status);
  const isCancelled = order.status === 'cancelled';

  return (
    <View className="flex-1 bg-white pt-16 px-4">
      <View className="flex-row items-center mb-6">
        <TouchableOpacity 
          onPress={() => router.replace('/(main)/orders')} 
          className="flex-row items-center py-4 pr-8 -ml-2 mr-2"
        >
          <Ionicons name="chevron-back" size={28} color="#2563eb" />
        </TouchableOpacity>
        <Text className="text-2xl font-bold">Order Tracking</Text>
      </View>

      {/* Progress Tracker */}
      <View className="bg-gray-50 p-5 rounded-2xl border border-gray-200 mb-6">
        <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
          Order Status: {order.order_type?.toUpperCase()}
        </Text>

        {isCancelled ? (
          <View className="bg-red-100 p-4 rounded-xl border border-red-200 flex-row items-center">
            <Ionicons name="alert-circle" size={24} color="#dc2626" />
            <Text className="text-red-700 font-bold ml-2 text-base">This order was cancelled.</Text>
          </View>
        ) : (
          <View className="flex-row justify-between items-center relative">
            {steps.map((step, idx) => {
              const isPassed = currentStepIndex >= idx;
              const isCurrent = currentStepIndex === idx;

              return (
                <View key={step.key} className="items-center flex-1">
                  <View 
                    style={[
                      styles.stepIndicator, 
                      isPassed ? styles.stepPassed : styles.stepFuture,
                      isCurrent && styles.stepCurrentHighlight
                    ]}
                  >
                    {isPassed ? (
                      <Ionicons name="checkmark" size={16} color="white" />
                    ) : (
                      <Text className="text-gray-400 font-bold text-xs">{idx + 1}</Text>
                    )}
                  </View>
                  <Text 
                    className={`text-xs text-center mt-2 ${isCurrent ? 'font-bold text-blue-600' : isPassed ? 'text-gray-900 font-medium' : 'text-gray-400'}`}
                  >
                    {step.label}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Order Info */}
      <View className="bg-gray-100 p-4 rounded-xl mb-6">
        <Text className="text-gray-500 mb-1">Order ID: {order.id}</Text>
        <Text className="text-gray-500 mb-1">
          Date: {new Date(order.created_at).toLocaleString()}
        </Text>
        {order.delivery_address && (
          <Text className="text-gray-500 mb-1">
            Destination: {order.delivery_address}
          </Text>
        )}
        <Text className="text-xl font-bold mt-2 text-blue-600">
          Total: ${Number(order.total_amount).toFixed(2)}
        </Text>
      </View>

      <Text className="text-xl font-bold mb-4">Items</Text>

      <FlatList
        data={order.order_items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View className="border-b border-gray-200 py-4">
            <View className="flex-row justify-between mb-1">
              <Text className="font-bold text-lg">
                {item.quantity}x {item.menu_items?.name || 'Item'}
              </Text>
              <Text className="font-bold">${Number(item.total_price).toFixed(2)}</Text>
            </View>
            
            {item.order_item_modifiers && item.order_item_modifiers.map((mod: any, index: number) => (
              <Text key={index} className="text-gray-500 ml-2 mt-1">
                + {mod.modifier_options?.name} {mod.price_adjustment > 0 ? `($${Number(mod.price_adjustment).toFixed(2)})` : ''}
              </Text>
            ))}
            {item.special_instructions && (
              <Text className="text-gray-500 ml-2 mt-1 italic">
                Note: {item.special_instructions}
              </Text>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stepIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepPassed: {
    backgroundColor: '#2563eb',
  },
  stepFuture: {
    backgroundColor: '#e5e7eb',
  },
  stepCurrentHighlight: {
    borderWidth: 3,
    borderColor: '#93c5fd',
  },
});