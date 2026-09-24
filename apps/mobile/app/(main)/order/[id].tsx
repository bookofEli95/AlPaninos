import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../../lib/supabase';
import { useBackHandler } from '../../../hooks/useBackHandler';
import { Ionicons } from '@expo/vector-icons';
import SkeletonBox from '../../../components/Skeleton';
import { getEtaDisplay } from '../../../lib/orderTiming';
import { reorderFromOrder } from '../../../lib/reorder';
import { tabularNums } from '../../../lib/typography';
import { groupRepeats } from '../../../lib/modifiers';

const DELIVERY_STEPS = [
  { key: 'received', label: 'Received' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'out_for_delivery', label: 'On the Way' },
  { key: 'completed', label: 'Delivered' },
];

const PICKUP_STEPS = [
  { key: 'received', label: 'Received' },
  { key: 'preparing', label: 'In the Press' },
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
  const [reordering, setReordering] = useState(false);
  const [now, setNow] = useState(Date.now());

  const goBackToOrders = useCallback(() => {
    router.replace('/(main)/orders');
  }, [router]);
  useBackHandler(goBackToOrders);

  const { data: order, isLoading, error: orderError } = useQuery({
    queryKey: ['order', id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('orders')
        .select(`
          *,
          locations ( name ),
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['orderRating', id] });
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert("Couldn't submit rating", e.message);
    } finally {
      setSubmittingRating(false);
    }
  };

  // Same shared helper the Orders list's Reorder button uses (lib/reorder.ts)
  // -- it skips discontinued items and re-charges full price for anything
  // the original order got free through a wheel prize/PaninoPoints reward.
  const handleReorder = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setReordering(true);
    try {
      const { skippedCount } = await reorderFromOrder(id);
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
      setReordering(false);
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
    () =>
      order
        ? getEtaDisplay(order.estimated_ready_at, order.status, order.order_type, order.requested_ready_at)
        : null,
    [order?.estimated_ready_at, order?.status, order?.order_type, order?.requested_ready_at, now]
  );

  if (isLoading) {
    return (
      <View className="flex-1 bg-[#FAF6F0] pt-16 px-4">
        <SkeletonBox width={140} height={26} style={{ marginBottom: 24 }} />
        <SkeletonBox height={140} borderRadius={24} style={{ marginBottom: 20 }} />
        <SkeletonBox height={110} borderRadius={24} style={{ marginBottom: 20 }} />
        {[1, 2].map(i => (
          <SkeletonBox key={i} height={60} borderRadius={16} style={{ marginBottom: 12 }} />
        ))}
      </View>
    );
  }

  if (orderError || !order) {
    return (
      <View className="flex-1 bg-[#FAF6F0] justify-center items-center p-6">
        <Ionicons name="alert-circle-outline" size={40} color="#A61C14" />
        <Text className="text-[#A61C14] font-inter-bold text-lg mt-3 mb-1">
          {orderError ? "Couldn't load this order" : 'Order not found'}
        </Text>
        <Text className="text-[#78716C] text-center mb-6">
          {orderError ? (orderError as Error).message : 'Please check your past orders list.'}
        </Text>
        <TouchableOpacity
          onPress={goBackToOrders}
          className="bg-[#A61C14] px-6 py-3 rounded-xl active:bg-[#85140E]"
        >
          <Text className="text-[#F4ECE1] font-inter-bold">Return to Orders</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const steps = order.order_type === 'delivery' ? DELIVERY_STEPS : PICKUP_STEPS;
  const currentStepIndex = steps.findIndex((s) => s.key === order.status);
  const isCancelled = order.status === 'cancelled';
  const isCompleted = order.status === 'completed';
  const isReadyForPickup = order.order_type === 'pickup' && order.status === 'ready';
  // Every step is flex-1, so step centers sit at (i + 0.5) / n of the row --
  // the connector track runs between the first and last centers, and its
  // filled part stops at the current step's center.
  const halfStepPct = 100 / (2 * steps.length);
  const fillPct = Math.max(0, currentStepIndex) * (100 / steps.length);

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-14">
      <View className="flex-row items-center px-4 mb-3">
        <TouchableOpacity
          onPress={goBackToOrders}
          className="flex-row items-center py-2 pr-3 -ml-2"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={26} color="#A61C14" />
          <Text className="text-[#A61C14] font-inter-bold text-lg">Orders</Text>
        </TouchableOpacity>
        <Text className="text-2xl font-display-bold text-[#1C1917] ml-1 flex-1" numberOfLines={1}>
          {isCompleted || isCancelled ? 'Order Details' : 'Live Tracker'}
        </Text>
      </View>

      <FlatList
        data={order.order_items}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        ListHeaderComponent={
          <>
            {order.is_catering && !isCancelled && (
              <View className="bg-white border border-[#A61C14] rounded-3xl p-4 mb-4 shadow-sm">
                <View className="flex-row items-center">
                  <Ionicons name="people" size={16} color="#A61C14" />
                  <Text className="text-[#A61C14] font-inter-extrabold text-xs uppercase tracking-wider ml-1.5">
                    Catering Order
                  </Text>
                </View>
                {order.catering_confirmed_at ? (
                  <View className="flex-row items-center mt-1.5">
                    <Ionicons name="checkmark-circle" size={16} color="#047857" />
                    <Text className="text-emerald-800 text-sm font-inter-semibold ml-1.5">Confirmed by the restaurant</Text>
                  </View>
                ) : (
                  <Text className="text-[#1C1917] text-sm mt-1.5">
                    Awaiting confirmation -- we'll call you to confirm the details before we start preparing it.
                  </Text>
                )}
              </View>
            )}

            {isReadyForPickup ? (
              <View className="bg-emerald-600 rounded-3xl p-4 mb-4 shadow-sm flex-row items-center">
                <View className="w-11 h-11 rounded-full bg-white/20 items-center justify-center mr-3">
                  <Ionicons name="bag-check" size={22} color="#F4ECE1" />
                </View>
                <View className="flex-1">
                  <Text className="text-[#F4ECE1] font-inter-bold text-lg">Your order is ready!</Text>
                  <Text className="text-[#F4ECE1] opacity-90 text-sm">
                    Pick it up at the front counter{order.locations?.name ? ` at ${order.locations.name}` : ''}.
                  </Text>
                </View>
              </View>
            ) : etaText ? (
              <View className="bg-white border border-stone-200 rounded-3xl p-4 mb-4 flex-row items-center shadow-sm">
                <View className="w-11 h-11 rounded-2xl bg-[#FAF6F0] border border-stone-200 items-center justify-center mr-3">
                  <Ionicons name="time-outline" size={20} color="#A61C14" />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-inter-bold uppercase tracking-wider text-[#78716C]">
                    {order.requested_ready_at ? 'Scheduled For' : 'Estimated Time'}
                  </Text>
                  <Text className="text-base font-inter-bold text-[#1C1917]">{etaText}</Text>
                </View>
              </View>
            ) : null}

            {/* Progress Tracker */}
            <View className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm mb-4">
              <View className="flex-row justify-between items-center mb-4">
                <Text className="text-xs font-inter-bold text-[#78716C] uppercase tracking-wider">
                  Order Status: {order.order_type?.toUpperCase()}
                </Text>
                <Text className="text-xs font-inter-semibold text-[#78716C]">#{order.id.slice(0, 8)}</Text>
              </View>

              {isCancelled ? (
                <View className="bg-[#FBE9E7] p-4 rounded-2xl border border-[#F0B4AC] flex-row items-center">
                  <Ionicons name="alert-circle" size={24} color="#A61C14" />
                  <Text className="text-[#A61C14] font-inter-bold ml-2 text-base">This order was cancelled.</Text>
                </View>
              ) : (
                <View style={styles.stepperRow}>
                  {/* Rendered before the steps so the circles paint over it */}
                  <View style={[styles.track, { left: `${halfStepPct}%`, right: `${halfStepPct}%` }]} />
                  {fillPct > 0 && (
                    <View style={[styles.track, styles.trackFill, { left: `${halfStepPct}%`, width: `${fillPct}%` }]} />
                  )}
                  {steps.map((step, idx) => {
                    const isPassed = currentStepIndex >= idx;
                    const isCurrent = currentStepIndex === idx;

                    return (
                      <View key={step.key} className="items-center flex-1 px-0.5">
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
                            <Text className="text-[#78716C] font-inter-bold text-xs">{idx + 1}</Text>
                          )}
                        </View>
                        <Text
                          className={`text-xs text-center mt-2 ${isCurrent ? 'font-inter-bold text-[#A61C14]' : isPassed ? 'text-[#1C1917] font-inter-medium' : 'text-[#78716C]'}`}
                          numberOfLines={2}
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
            <View className="bg-white p-4 rounded-3xl border border-stone-200 shadow-sm mb-4">
              <View className="flex-row justify-between items-center pb-2.5 border-b border-stone-100">
                <Text className="text-[#78716C]">Placed</Text>
                <Text className="text-[#1C1917] font-inter-semibold">
                  {new Date(order.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })} at{' '}
                  {new Date(order.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>

              {!!order.catering_company && (
                <View className="py-2.5 border-b border-stone-100">
                  <Text className="text-[#78716C] mb-0.5">Company / Event</Text>
                  <Text className="text-[#1C1917] font-inter-semibold">{order.catering_company}</Text>
                </View>
              )}

              {order.delivery_address && (
                <View className="py-2.5 border-b border-stone-100">
                  <Text className="text-[#78716C] mb-0.5">Delivery Address</Text>
                  <Text className="text-[#1C1917] font-inter-semibold">{order.delivery_address}</Text>
                  {!!order.catering_notes && (
                    <Text className="text-[#78716C] text-sm mt-1">{order.catering_notes}</Text>
                  )}
                </View>
              )}

              {order.subtotal_amount != null && order.tax_amount != null && (
                <View className="pt-2.5">
                  <View className="flex-row justify-between mb-1">
                    <Text className="text-[#78716C]">Subtotal</Text>
                    <Text className="text-[#1C1917]" style={tabularNums}>${Number(order.subtotal_amount).toFixed(2)}</Text>
                  </View>
                  {order.discount_amount > 0 && (
                    <View className="flex-row justify-between mb-1">
                      <Text className="text-green-700">Discount{order.promo_code ? ` (${order.promo_code})` : ''}</Text>
                      <Text className="text-green-700 font-inter-bold" style={tabularNums}>-${Number(order.discount_amount).toFixed(2)}</Text>
                    </View>
                  )}
                  <View className="flex-row justify-between">
                    <Text className="text-[#78716C]">Tax</Text>
                    <Text className="text-[#1C1917]" style={tabularNums}>${Number(order.tax_amount).toFixed(2)}</Text>
                  </View>
                </View>
              )}

              <View className="flex-row justify-between items-center pt-2.5 mt-2.5 border-t border-stone-100">
                <Text className="text-base font-inter-bold text-[#1C1917]">Total</Text>
                <Text className="text-xl font-inter-bold text-[#A61C14]" style={tabularNums}>${Number(order.total_amount).toFixed(2)}</Text>
              </View>
            </View>

            {isCompleted && (
              <TouchableOpacity
                onPress={handleReorder}
                disabled={reordering}
                className="bg-[#A61C14] py-3.5 px-4 rounded-2xl flex-row items-center justify-center shadow-sm mb-4 active:bg-[#85140E]"
              >
                {reordering ? (
                  <ActivityIndicator color="#F4ECE1" size="small" />
                ) : (
                  <>
                    <Ionicons name="repeat" size={18} color="#F4ECE1" />
                    <Text className="text-[#F4ECE1] font-inter-bold text-base ml-2">Order This Again</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <Text className="text-xl font-inter-bold mb-3 text-[#1C1917] px-1">
              Items ({order.order_items?.length || 0})
            </Text>
          </>
        }
        renderItem={({ item }) => (
          <View className="bg-white p-4 rounded-2xl border border-stone-200 mb-2.5">
            <View className="flex-row justify-between items-start">
              <Text className="font-inter-bold text-base text-[#1C1917] flex-1 mr-2">
                {item.quantity}x {item.menu_items?.name || 'Item'}
              </Text>
              <Text className="font-inter-bold text-base text-[#A61C14]" style={tabularNums}>${Number(item.total_price).toFixed(2)}</Text>
            </View>

            {item.order_item_modifiers?.length > 0 && (
              <View className="flex-row flex-wrap mt-2">
                {groupRepeats(item.order_item_modifiers as any[], (mod) => mod.modifier_options?.name ?? '').map(
                  ({ item: mod, count }, index) => (
                    <View
                      key={index}
                      className="bg-[#FAF6F0] border border-stone-200 rounded-lg px-2 py-0.5 mr-1.5 mb-1.5"
                    >
                      <Text className="text-stone-600 text-sm">
                        + {count > 1 ? `${count}× ` : ''}{mod.modifier_options?.name}
                        {mod.price_adjustment > 0 ? ` ($${(Number(mod.price_adjustment) * count).toFixed(2)})` : ''}
                      </Text>
                    </View>
                  )
                )}
              </View>
            )}
            {item.special_instructions && (
              <Text className="text-[#78716C] mt-1.5 italic">
                Note: {item.special_instructions}
              </Text>
            )}
          </View>
        )}
        ListFooterComponent={
          isCompleted ? (
            <View className="mt-2 bg-white border border-stone-200 rounded-3xl p-5 shadow-sm">
              {rating ? (
                <>
                  <Text className="text-lg font-inter-bold text-[#1C1917] mb-2">Your Rating</Text>
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
                  <Text className="text-lg font-inter-bold text-[#1C1917] mb-1">How was your order?</Text>
                  <Text className="text-[#78716C] text-sm mb-3">Let us know how we did.</Text>
                  <View className="flex-row mb-4">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <TouchableOpacity
                        key={n}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          setRatingValue(n);
                        }}
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
                    className="bg-[#FAF6F0] border border-stone-300 rounded-2xl p-3 text-base text-[#1C1917] mb-3 min-h-[72px]"
                    placeholder="Tell us what you liked (or what we can improve)"
                    placeholderTextColor="#A8A29E"
                    value={ratingComment}
                    onChangeText={setRatingComment}
                    multiline
                    textAlignVertical="top"
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
                      <Text className={`font-inter-bold text-base ${ratingValue < 1 ? 'text-stone-500' : 'text-[#F4ECE1]'}`}>
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
  // flex-start (not center) so a two-line label like "Ready for Pickup"
  // can't push its circle down out of line with the connector track.
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  track: {
    position: 'absolute',
    top: 14,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E7E5E4',
  },
  trackFill: {
    backgroundColor: '#A61C14',
  },
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
