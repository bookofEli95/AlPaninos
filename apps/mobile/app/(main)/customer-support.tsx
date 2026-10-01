import React from 'react';
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  Image,
  Keyboard,
  StyleSheet,
} from 'react-native';
import { Alert } from '../../lib/alert';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useProfile } from '../../hooks/useProfile';
import { useBackHandler } from '../../hooks/useBackHandler';
import { useCartBarSpace } from '../../hooks/useCartBarSpace';
import SkeletonBox from '../../components/Skeleton';
import { orderItemsSummary, orderPickSubtitle } from '../../lib/supportOrders';
import { tabularNums } from '../../lib/typography';

const RED = '#A61C14';
const SUPPORT_PHONE = '(548) 866-0420';
const SUPPORT_PHONE_DIAL = '+15488660420';

// Optional one-tap topic, saved alongside the message (customer_feedback.
// topic) so staff can sort feedback -- a "Missing Item" can be acted on
// right away instead of being buried among general comments. Each topic
// also swaps in a placeholder that prompts for the details that matter
// (fewer of them once an order is attached -- that says when, and whether
// it was pickup or delivery).
const TOPICS: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  placeholder: string;
  placeholderNoOrder?: string;
}[] = [
  { label: 'Food Quality', icon: 'restaurant-outline', placeholder: 'Which item was it, and what was wrong?' },
  {
    label: 'Missing Item',
    icon: 'bag-remove-outline',
    placeholder: 'What was missing from your order?',
    placeholderNoOrder: 'What was missing, and roughly when did you order?',
  },
  {
    label: 'Order Speed',
    icon: 'time-outline',
    placeholder: 'How long did it take, and what happened?',
    placeholderNoOrder: 'How long did it take, and was it pickup or delivery?',
  },
  { label: 'Compliment', icon: 'heart-outline', placeholder: "What did you love? We'll pass it on to the team." },
  { label: 'Other', icon: 'chatbubble-ellipses-outline', placeholder: 'Tell us what you think...' },
];

// "Which order is this about?": the most recent orders, the first few
// showing until "Show older orders" is tapped.
const RECENT_ORDERS = 10;
const SHOWN_AT_FIRST = 3;
const ORDER_FIELDS =
  'id, created_at, requested_ready_at, order_type, is_catering, total_amount, order_items ( quantity, menu_items ( name, image_url ) )';

type PickOrder = {
  id: string;
  created_at: string;
  requested_ready_at: string | null;
  order_type: string | null;
  is_catering: boolean | null;
  total_amount: number;
  order_items: { quantity: number; menu_items: { name: string | null; image_url: string | null } | null }[] | null;
};

// More > Customer Support (also an order's "Problem with this order?",
// which opens it with that order already picked -- the orderId param).
export default function CustomerSupportScreen() {
  const cartBarSpace = useCartBarSpace();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { orderId: orderIdParam } = useLocalSearchParams<{ orderId?: string }>();
  const { session } = useAuthStore();
  const userId = session?.user?.id;
  const isAnonymous = session?.user?.is_anonymous ?? false;
  const { data: profile } = useProfile();

  const [message, setMessage] = useState('');
  // The same, for the focus effect below without re-running it per keystroke.
  const messageRef = useRef('');
  const [topic, setTopic] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(orderIdParam ?? null);
  const [showAll, setShowAll] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // After sending: a thank-you in place of the form, until the next visit.
  const [sent, setSent] = useState<{ withOrder: boolean } | null>(null);
  const [messageFocused, setMessageFocused] = useState(false);

  const goBack = useCallback(() => {
    router.replace(orderIdParam ? `/(main)/order/${orderIdParam}` : '/(main)/more');
  }, [router, orderIdParam]);
  useBackHandler(goBack);

  const { data: recentOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ['support-orders', userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('orders')
        .select(ORDER_FIELDS)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(RECENT_ORDERS);
      if (error) throw error;
      return (data || []) as PickOrder[];
    },
    enabled: !!userId,
  });
  // Opened from an order older than those: that one goes on the end.
  const needsOpenedOrder =
    !!orderIdParam && !!recentOrders && !recentOrders.some((o) => o.id === orderIdParam);
  const { data: openedOrder } = useQuery({
    queryKey: ['support-order', orderIdParam],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('orders')
        .select(ORDER_FIELDS)
        .eq('id', orderIdParam)
        .maybeSingle();
      if (error) throw error;
      return (data as PickOrder | null) ?? null;
    },
    enabled: needsOpenedOrder,
  });
  const orders = recentOrders && needsOpenedOrder && openedOrder ? [...recentOrders, openedOrder] : recentOrders;

  // This screen stays mounted between visits. Each visit: back to the form;
  // the order it was opened from is picked; and with nothing typed yet,
  // nothing left picked from last time either. A half-written message (and
  // what goes with it) is kept. The list is refreshed for any new orders.
  const visits = useRef(0);
  useFocusEffect(
    useCallback(() => {
      if (visits.current++ > 0) queryClient.invalidateQueries({ queryKey: ['support-orders'] });
      setSent(null);
      setShowAll(false);
      if (orderIdParam) {
        setSelectedOrderId(orderIdParam);
      } else if (!messageRef.current.trim()) {
        setSelectedOrderId(null);
        setTopic(null);
      }
    }, [orderIdParam, queryClient])
  );

  // The message box is near the bottom, so the keyboard would cover it (and
  // Send). While it's open the page gets that much extra room, and scrolls
  // the box into view.
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  useEffect(() => {
    if (!messageFocused || keyboardHeight === 0) return;
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [messageFocused, keyboardHeight]);

  const pickedIndex = orders ? orders.findIndex((o) => o.id === selectedOrderId) : -1;
  // A pick further down the list (opened from an older order) shows it all.
  const expanded = showAll || pickedIndex >= SHOWN_AT_FIRST;
  const visibleOrders = orders ? (expanded ? orders : orders.slice(0, SHOWN_AT_FIRST)) : [];
  const hiddenCount = orders ? orders.length - visibleOrders.length : 0;
  // Guests have no orders to show, so nothing appears for them while it checks.
  const showOrderSection = ordersLoading ? !isAnonymous : !!orders?.length;
  const orderAttached = pickedIndex >= 0;

  const topicInfo = TOPICS.find((t) => t.label === topic);
  const placeholder = topicInfo
    ? !orderAttached && topicInfo.placeholderNoOrder
      ? topicInfo.placeholderNoOrder
      : topicInfo.placeholder
    : 'Tell us what you think...';
  const hasMessage = !!message.trim();

  const pickOrder = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    // Once open, the list stays open -- un-picking an older order doesn't
    // fold it away from under the finger.
    if (expanded) setShowAll(true);
    setSelectedOrderId((current) => (current === id ? null : id));
  };

  const callUs = () => {
    Linking.openURL(`tel:${SUPPORT_PHONE_DIAL}`).catch(() =>
      Alert.alert('Call Us', `You can reach us at ${SUPPORT_PHONE}.`)
    );
  };

  const handleSubmit = async () => {
    if (!hasMessage || submitting) return;
    Keyboard.dismiss();
    setSubmitting(true);
    try {
      const { error } = await (supabase as any).from('customer_feedback').insert({
        user_id: userId,
        message: message.trim(),
        // Each only sent when picked, so a plain comment still goes through
        // the same way it always has.
        ...(topic ? { topic } : {}),
        ...(orderAttached ? { order_id: selectedOrderId } : {}),
      });
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSent({ withOrder: orderAttached });
      setMessage('');
      messageRef.current = '';
      setTopic(null);
      setSelectedOrderId(null);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } catch (e: any) {
      Alert.alert("Couldn't send your message", e?.message || 'Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-14">
      <View className="flex-row items-center px-4 mb-2">
        <TouchableOpacity
          onPress={goBack}
          className="py-2 pr-2 -ml-2"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={28} color={RED} />
        </TouchableOpacity>
        <Text className="text-2xl font-display-bold text-[#1C1917] tracking-tight">Customer Support</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1 px-4"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: cartBarSpace + 32 + keyboardHeight }}
      >
        {/* Call -- for anything that can't wait */}
        <TouchableOpacity
          onPress={callUs}
          activeOpacity={0.85}
          accessibilityLabel={`Call Al Paninos at ${SUPPORT_PHONE}`}
          className="flex-row items-center bg-[#1C1917] rounded-2xl px-4 py-4"
        >
          <View className="w-11 h-11 rounded-full bg-[#A61C14] items-center justify-center mr-3">
            <Ionicons name="call" size={19} color="#FFC72C" />
          </View>
          <View className="flex-1 mr-2">
            <Text className="text-[#F4ECE1] font-inter-bold text-[15px]">Call Us</Text>
            <Text className="text-[#FFC72C] font-inter-extrabold text-base" style={tabularNums}>
              {SUPPORT_PHONE}
            </Text>
            <Text className="text-[#A8A29E] text-xs mt-0.5">Quickest for an order in progress</Text>
          </View>
          <View className="bg-[#A61C14] rounded-full px-4 py-2">
            <Text className="text-[#F4ECE1] font-inter-bold text-[13px]">Call</Text>
          </View>
        </TouchableOpacity>

        {sent ? (
          <View key="sent" className="bg-white rounded-2xl border border-stone-200 shadow-sm items-center px-5 py-7 mt-6">
            <View className="w-14 h-14 rounded-full bg-emerald-50 items-center justify-center mb-3">
              <Ionicons name="checkmark-circle" size={34} color="#047857" />
            </View>
            <Text className="text-xl font-display-bold text-[#1C1917]">Message Sent</Text>
            <Text className="text-sm text-stone-600 text-center leading-5 mt-1.5">
              Thanks{profile?.first_name ? `, ${profile.first_name}` : ''} -- it's on its way to the Al Paninos team
              {sent.withOrder ? ", along with the order it's about." : '.'}
            </Text>
            <TouchableOpacity
              onPress={() => setSent(null)}
              activeOpacity={0.8}
              className="mt-5 px-5 py-3 rounded-2xl bg-stone-100"
            >
              <Text className="text-[#1C1917] font-inter-bold text-sm">Send Another Message</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View key="form">
            <Text className="text-lg font-inter-bold text-[#1C1917] mt-7 mb-3 px-1">Send Us a Message</Text>

            <SectionLabel optional>What's it about?</SectionLabel>
            <View className="flex-row flex-wrap mb-3">
              {TOPICS.map((t) => {
                const selected = topic === t.label;
                return (
                  <TouchableOpacity
                    key={t.label}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setTopic(selected ? null : t.label);
                    }}
                    activeOpacity={0.8}
                    accessibilityState={{ selected }}
                    className="flex-row items-center px-3 py-2 rounded-full mr-2 mb-2"
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    <Ionicons name={t.icon} size={14} color={selected ? '#F4ECE1' : '#78716C'} />
                    <Text
                      className="text-[13px] font-inter-semibold ml-1.5"
                      style={{ color: selected ? '#F4ECE1' : '#1C1917' }}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {showOrderSection && (
              <>
                <SectionLabel optional>Which order is this about?</SectionLabel>
                <View className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden mb-5">
                  {ordersLoading || !orders
                    ? [0, 1].map((i) => (
                        <View
                          key={i}
                          style={[styles.orderRow, i === 0 && styles.orderRowDivider]}
                        >
                          <SkeletonBox width={44} height={44} borderRadius={12} />
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <SkeletonBox width={150} height={14} />
                            <SkeletonBox width={110} height={12} style={{ marginTop: 6 }} />
                          </View>
                        </View>
                      ))
                    : visibleOrders.map((order, i) => (
                        <OrderPickRow
                          key={order.id}
                          order={order}
                          selected={order.id === selectedOrderId}
                          divider={i < visibleOrders.length - 1 || hiddenCount > 0}
                          onPress={() => pickOrder(order.id)}
                        />
                      ))}
                  {hiddenCount > 0 && (
                    <TouchableOpacity
                      onPress={() => setShowAll(true)}
                      activeOpacity={0.7}
                      className="flex-row items-center justify-center py-3"
                    >
                      <Text className="text-[13px] font-inter-bold text-[#A61C14]">
                        Show {hiddenCount} older {hiddenCount === 1 ? 'order' : 'orders'}
                      </Text>
                      <Ionicons name="chevron-down" size={14} color={RED} style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}

            <SectionLabel>Your message</SectionLabel>
            <TextInput
              value={message}
              onChangeText={(text) => {
                setMessage(text);
                messageRef.current = text;
              }}
              placeholder={placeholder}
              placeholderTextColor="#A8A29E"
              multiline
              maxLength={2000}
              textAlignVertical="top"
              onFocus={() => setMessageFocused(true)}
              onBlur={() => setMessageFocused(false)}
              style={[styles.message, messageFocused && styles.messageFocused]}
            />

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={!hasMessage || submitting}
              activeOpacity={0.85}
              className="rounded-2xl py-4 mt-4 items-center flex-row justify-center"
              style={{ backgroundColor: hasMessage ? RED : '#D6D3D1' }}
            >
              {submitting ? (
                <ActivityIndicator color="#F4ECE1" />
              ) : (
                <>
                  <Ionicons name="send" size={16} color={hasMessage ? '#F4ECE1' : '#78716C'} />
                  <Text className="font-inter-bold text-base ml-2" style={{ color: hasMessage ? '#F4ECE1' : '#78716C' }}>
                    Send Message
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// A small caps label over each part of the form, "Optional" on the right
// where it is.
function SectionLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <View className="flex-row items-center justify-between mb-2 px-1">
      <Text className="text-xs font-inter-bold uppercase tracking-wider text-stone-500">{children}</Text>
      {optional && <Text className="text-xs font-inter-medium text-stone-400">Optional</Text>}
    </View>
  );
}

// One recent order: its first photo, what was in it, the total, and when.
// Tapping picks it (a tick on the right); tapping again un-picks it.
function OrderPickRow({
  order,
  selected,
  divider,
  onPress,
}: {
  order: PickOrder;
  selected: boolean;
  divider: boolean;
  onPress: () => void;
}) {
  const lines = order.order_items || [];
  const photo = lines.find((l) => l.menu_items?.image_url)?.menu_items?.image_url ?? null;
  const summary = orderItemsSummary(lines) || 'Your order';
  const subtitle = orderPickSubtitle(order);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityState={{ selected }}
      accessibilityLabel={`${summary}, ${subtitle}`}
      style={[styles.orderRow, divider && styles.orderRowDivider, selected && styles.orderRowSelected]}
    >
      {photo ? (
        <Image source={{ uri: photo }} style={styles.orderPhoto} />
      ) : (
        <View style={[styles.orderPhoto, styles.orderPhotoEmpty]}>
          <Ionicons name="receipt-outline" size={18} color="#A8A29E" />
        </View>
      )}
      <View style={{ flex: 1, marginLeft: 12, marginRight: 10 }}>
        <Text className="text-sm font-inter-bold text-[#1C1917]" numberOfLines={1}>
          {summary}
        </Text>
        <Text className="text-xs text-[#78716C] mt-0.5" style={tabularNums} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <View style={[styles.tick, selected && styles.tickSelected]}>
        <Ionicons name="checkmark" size={14} color={selected ? '#FFFFFF' : 'transparent'} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    borderColor: '#D6D3D1',
  },
  chipSelected: {
    backgroundColor: RED,
    borderColor: RED,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  orderRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F4',
  },
  orderRowSelected: {
    backgroundColor: '#FBF1F0',
  },
  orderPhoto: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F5F5F4',
  },
  orderPhotoEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#D6D3D1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickSelected: {
    backgroundColor: RED,
    borderColor: RED,
  },
  message: {
    minHeight: 130,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E5E4',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 13,
    fontSize: 15,
    lineHeight: 21,
    color: '#1C1917',
    fontFamily: 'Inter_400Regular',
  },
  messageFocused: {
    borderColor: RED,
  },
});
