import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import SkeletonBox from '../../../components/Skeleton';
import { getEtaDisplay } from '../../../lib/orderTiming';

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

  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [now, setNow] = useState(Date.now());

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

  const { data: rating } = useQuery({
    queryKey: ['orderRating', id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('order_ratings')
        .select('*')
        .eq('order_id', id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id && order?.status === 'completed',
  });

  const handleSubmitRating = async () => {
    if (ratingValue < 1) return;
    setSubmittingRating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from('order_ratings').insert({
        order_id: id,
        user_id: user?.id,
        rating: ratingValue,
        comment: ratingComment.trim() || null,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['orderRating', id] });
    } catch (e: any) {
      Alert.alert("Couldn't submit rating", e.message);
    } finally {
      setSubmittingRating(false);
    }
  };

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

  // Ticks every 30s purely to force the ETA text below to recompute against
  // the current time -- getEtaDisplay reads Date.now() itself, this state is
  // just the re-render trigger.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  const etaText = useMemo(
    () => (order ? getEtaDisplay(order.estimated_ready_at, order.status, order.order_type) : null),
    [order?.estimated_ready_at, order?.status, order?.order_type, now]
  );

  if (isLoading) {
    return (
      <View className="flex-1 bg-[#FAF6F0] pt-16 px-4">
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
      <View className="flex-1 bg-[#FAF6F0] justify-center items-center p-4">
        <Text className="text-[#A61C14] font-bold text-lg mb-2">Couldn't load this order</Text>
        <Text className="text-[#78716C] text-center mb-4">{(orderError as Error).message}</Text>
        <TouchableOpacity onPress={() => router.replace('/(main)/orders')}>
          <Text className="text-[#A61C14] font-bold">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!order) {
    return (
      <View className="flex-1 bg-[#FAF6F0] justify-center items-center p-4">
        <Text className="text-[#78716C] text-lg mb-4">Order not found.</Text>
        <TouchableOpacity onPress={() => router.replace('/(main)/orders')}>
          <Text className="text-[#A61C14] font-bold">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const steps = order.order_type === 'delivery' ? DELIVERY_STEPS : PICKUP_STEPS;
  const currentStepIndex = steps.findIndex((s) => s.key === order.status);
  const isCancelled = order.status === 'cancelled';
  const isCompleted = order.status === 'completed';

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-16 px-4">
      <View className="flex-row items-center mb-6">
        <TouchableOpacity
          onPress={() => router.replace('/(main)/orders')}
          className="flex-row items-center py-4 pr-8 -ml-2 mr-2"
        >
          <Ionicons name="chevron-back" size={28} color="#A61C14" />
        </TouchableOpacity>
        <Text className="text-2xl font-bold text-[#1C1917]">Order Tracking</Text>
      </View>

      {etaText && (
        <View className="bg-white border border-stone-200 rounded-2xl p-4 mb-6 flex-row items-center shadow-sm">
          <Ionicons name="time-outline" size={22} color="#A61C14" />
          <Text className="text-[#1C1917] font-bold text-base ml-3">{etaText}</Text>
        </View>
      )}

      {/* Progress Tracker */}
      <View className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm mb-6">
        <Text className="text-xs font-bold text-[#78716C] uppercase tracking-wider mb-4">
          Order Status: {order.order_type?.toUpperCase()}
        </Text>

        {isCancelled ? (
          <View className="bg-[#FBE9E7] p-4 rounded-xl border border-[#F0B4AC] flex-row items-center">
            <Ionicons name="alert-circle" size={24} color="#A61C14" />
            <Text className="text-[#A61C14] font-bold ml-2 text-base">This order was cancelled.</Text>
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
                      <Ionicons name="checkmark" size={16} color="#F4ECE1" />
                    ) : (
                      <Text className="text-[#78716C] font-bold text-xs">{idx + 1}</Text>
                    )}
                  </View>
                  <Text
                    className={`text-xs text-center mt-2 ${isCurrent ? 'font-bold text-[#A61C14]' : isPassed ? 'text-[#1C1917] font-medium' : 'text-[#78716C]'}`}
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
      <View className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm mb-6">
        <Text className="text-[#78716C] mb-1">Order ID: {order.id}</Text>
        <Text className="text-[#78716C] mb-1">
          Date: {new Date(order.created_at).toLocaleString()}
        </Text>
        {order.delivery_address && (
          <Text className="text-[#78716C] mb-1">
            Destination: {order.delivery_address}
          </Text>
        )}
        <Text className="text-xl font-bold mt-2 text-[#A61C14]">
          Total: ${Number(order.total_amount).toFixed(2)}
        </Text>
      </View>

      <Text className="text-xl font-bold mb-4 text-[#1C1917]">Items</Text>

      <FlatList
        data={order.order_items}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <View className="border-b border-stone-200 py-4">
            <View className="flex-row justify-between mb-1">
              <Text className="font-bold text-lg text-[#1C1917]">
                {item.quantity}x {item.menu_items?.name || 'Item'}
              </Text>
              <Text className="font-bold text-[#A61C14]">${Number(item.total_price).toFixed(2)}</Text>
            </View>

            {item.order_item_modifiers && item.order_item_modifiers.map((mod: any, index: number) => (
              <Text key={index} className="text-[#78716C] ml-2 mt-1">
                + {mod.modifier_options?.name} {mod.price_adjustment > 0 ? `($${Number(mod.price_adjustment).toFixed(2)})` : ''}
              </Text>
            ))}
            {item.special_instructions && (
              <Text className="text-[#78716C] ml-2 mt-1 italic">
                Note: {item.special_instructions}
              </Text>
            )}
          </View>
        )}
        ListFooterComponent={
          isCompleted ? (
            <View className="mt-4 mb-8 bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
              {rating ? (
                <>
                  <Text className="text-lg font-bold text-[#1C1917] mb-2">Your Rating</Text>
                  <View className="flex-row mb-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Ionicons
                        key={n}
                        name={n <= rating.rating ? 'star' : 'star-outline'}
                        size={24}
                        color="#A61C14"
                        style={{ marginRight: 4 }}
                      />
                    ))}
                  </View>
                  {rating.comment && <Text className="text-[#78716C]">{rating.comment}</Text>}
                  <Text className="text-[#78716C] text-sm mt-2">Thanks for the feedback!</Text>
                </>
              ) : (
                <>
                  <Text className="text-lg font-bold text-[#1C1917] mb-1">How was your order?</Text>
                  <Text className="text-[#78716C] text-sm mb-3">Let us know how we did.</Text>
                  <View className="flex-row mb-4">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <TouchableOpacity
                        key={n}
                        onPress={() => setRatingValue(n)}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                      >
                        <Ionicons
                          name={n <= ratingValue ? 'star' : 'star-outline'}
                          size={32}
                          color="#A61C14"
                          style={{ marginRight: 6 }}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    className="bg-[#FAF6F0] border border-stone-300 rounded-xl p-3 text-base text-[#1C1917] mb-3"
                    placeholder="Add a comment (optional)"
                    placeholderTextColor="#A8A29E"
                    value={ratingComment}
                    onChangeText={setRatingComment}
                    multiline
                  />
                  <TouchableOpacity
                    onPress={handleSubmitRating}
                    disabled={ratingValue < 1 || submittingRating}
                    className={`py-3.5 rounded-xl items-center ${
                      ratingValue < 1 || submittingRating ? 'bg-stone-300' : 'bg-[#A61C14] active:bg-[#85140E]'
                    }`}
                  >
                    {submittingRating ? (
                      <ActivityIndicator color="#F4ECE1" />
                    ) : (
                      <Text className={`font-bold text-base ${ratingValue < 1 ? 'text-stone-500' : 'text-[#F4ECE1]'}`}>
                        Submit Rating
                      </Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          ) : null
        }
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
    backgroundColor: '#A61C14',
  },
  stepFuture: {
    backgroundColor: '#E7E5E4',
  },
  stepCurrentHighlight: {
    borderWidth: 3,
    borderColor: '#F0B4AC',
  },
});
