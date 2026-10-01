import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Switch, ActivityIndicator, ScrollView, Linking, AppState } from 'react-native';
import { Alert } from '../../lib/alert';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useBackHandler } from '../../hooks/useBackHandler';
import { useCartBarSpace } from '../../hooks/useCartBarSpace';
import { getPushPermissionStatus, registerForPushNotificationsAsync, savePushToken } from '../../lib/pushNotifications';

const RED = '#A61C14';

type Prefs = { push_enabled: boolean; notify_email: boolean };

// More > Notifications: how the customer hears about their order.
//   * Push -- on this phone. The switch is their choice (profiles.push_enabled,
//     checked by send-order-notification); separately, the phone itself has
//     to allow notifications, so this also shows where that stands and how
//     to fix it.
//   * Email -- order updates to their account email (profiles.notify_email,
//     copied onto each order at checkout). Guests choose this at checkout,
//     where they give an email.
// Sent when an order is ready, goes out for delivery, or is cancelled.
export default function NotificationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const cartBarSpace = useCartBarSpace();
  const { session } = useAuthStore();
  const userId = session?.user?.id;
  const isAnonymous = session?.user?.is_anonymous ?? false;
  const email = session?.user?.email ?? null;

  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [savingKey, setSavingKey] = useState<keyof Prefs | null>(null);
  // This phone's own permission: null where push can't work (Expo Go, a
  // simulator) -- see lib/pushNotifications.
  const [deviceStatus, setDeviceStatus] = useState<'granted' | 'denied' | 'undetermined' | null>(null);
  const [asking, setAsking] = useState(false);

  const goBackToMore = useCallback(() => {
    router.replace('/(main)/more');
  }, [router]);
  useBackHandler(goBackToMore);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await (supabase as any)
        .from('profiles')
        .select('push_enabled, notify_email')
        .eq('id', userId)
        .maybeSingle();
      setPrefs({ push_enabled: data?.push_enabled ?? true, notify_email: data?.notify_email ?? true });
    })();
  }, [userId]);

  // Re-checked on every visit, and on coming back from the phone's settings.
  const refreshDeviceStatus = useCallback(() => {
    getPushPermissionStatus().then(setDeviceStatus).catch(() => setDeviceStatus(null));
  }, []);
  useFocusEffect(refreshDeviceStatus);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshDeviceStatus();
    });
    return () => sub.remove();
  }, [refreshDeviceStatus]);

  const save = async (key: keyof Prefs, value: boolean) => {
    if (!userId || !prefs) return;
    Haptics.selectionAsync().catch(() => {});
    const before = prefs[key];
    setPrefs({ ...prefs, [key]: value });
    setSavingKey(key);
    const { error } = await (supabase as any).from('profiles').update({ [key]: value }).eq('id', userId);
    setSavingKey(null);
    if (error) {
      setPrefs((p) => (p ? { ...p, [key]: before } : p));
      Alert.alert("Couldn't save that", 'Please check your connection and try again.');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['profile', userId] });
  };

  const allowOnThisPhone = async () => {
    setAsking(true);
    try {
      const token = await registerForPushNotificationsAsync({ ask: true });
      if (token) await savePushToken(token);
    } finally {
      setAsking(false);
      refreshDeviceStatus();
    }
  };

  const bothOff = !!prefs && !prefs.push_enabled && !prefs.notify_email && !isAnonymous;

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-14">
      <View className="flex-row items-center px-4 mb-2">
        <TouchableOpacity
          onPress={goBackToMore}
          className="py-2 pr-2 -ml-2"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={28} color={RED} />
        </TouchableOpacity>
        <Text className="text-2xl font-display-bold text-[#1C1917] tracking-tight">Notifications</Text>
      </View>

      {!prefs ? (
        <ActivityIndicator size="large" color={RED} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          className="flex-1 px-4"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: cartBarSpace + 32 }}
        >
          <Text className="text-sm text-stone-600 leading-5 mb-5 px-1">
            How we let you know about your order -- when it's ready, on its way, or if anything changes.
          </Text>

          <Text className="text-xs font-inter-bold uppercase tracking-wider text-stone-500 mb-2 px-1">Order Updates</Text>
          <View className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
            {/* Push */}
            <View className="px-4 py-3.5 border-b border-stone-100">
              <View className="flex-row items-center">
                <View className="w-10 h-10 rounded-xl bg-[#FAF6F0] items-center justify-center mr-3">
                  <Ionicons name="notifications" size={19} color={RED} />
                </View>
                <View className="flex-1 mr-3">
                  <Text className="text-[15px] font-inter-semibold text-[#1C1917]">Push notifications</Text>
                  <Text className="text-[13px] text-[#78716C] mt-0.5">A buzz on this phone the moment it's ready</Text>
                </View>
                <Switch
                  value={prefs.push_enabled}
                  onValueChange={(v) => save('push_enabled', v)}
                  disabled={savingKey === 'push_enabled'}
                  trackColor={{ false: '#E7E5E4', true: RED }}
                  thumbColor="#FFFFFF"
                  accessibilityLabel="Push notifications"
                />
              </View>

              {/* Where this phone stands -- the switch alone can't turn
                  notifications on if the phone itself says no. */}
              {prefs.push_enabled && deviceStatus === 'undetermined' && (
                <TouchableOpacity
                  onPress={allowOnThisPhone}
                  disabled={asking}
                  activeOpacity={0.85}
                  className="flex-row items-center justify-center bg-[#A61C14] rounded-xl py-2.5 mt-3"
                >
                  {asking ? (
                    <ActivityIndicator size="small" color="#F4ECE1" />
                  ) : (
                    <>
                      <Ionicons name="notifications-outline" size={15} color="#F4ECE1" />
                      <Text className="text-[#F4ECE1] font-inter-bold text-sm ml-1.5">Allow on This Phone</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
              {prefs.push_enabled && deviceStatus === 'denied' && (
                <View className="flex-row items-start bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mt-3">
                  <Ionicons name="alert-circle" size={15} color="#B45309" style={{ marginTop: 1 }} />
                  <View className="flex-1 ml-2">
                    <Text className="text-amber-900 text-[13px] font-inter-semibold">
                      Notifications are turned off for Al Paninos in your phone's settings.
                    </Text>
                    <TouchableOpacity onPress={() => Linking.openSettings().catch(() => {})} className="mt-1 self-start">
                      <Text className="text-[#A61C14] text-[13px] font-inter-bold">Open Phone Settings ›</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              {prefs.push_enabled && deviceStatus === 'granted' && (
                <View className="flex-row items-center mt-2 ml-[52px]">
                  <Ionicons name="checkmark-circle" size={14} color="#047857" />
                  <Text className="text-emerald-800 text-xs font-inter-semibold ml-1">On for this phone</Text>
                </View>
              )}
              {prefs.push_enabled && deviceStatus === null && (
                <Text className="text-xs text-stone-500 mt-2 ml-[52px]">
                  Works in the Al Paninos app from the App Store or Google Play.
                </Text>
              )}
            </View>

            {/* Email */}
            <View className="px-4 py-3.5 flex-row items-center">
              <View className="w-10 h-10 rounded-xl bg-[#FAF6F0] items-center justify-center mr-3">
                <Ionicons name="mail" size={18} color={RED} />
              </View>
              <View className="flex-1 mr-3">
                <Text className="text-[15px] font-inter-semibold text-[#1C1917]">Email</Text>
                <Text className="text-[13px] text-[#78716C] mt-0.5" numberOfLines={2}>
                  {isAnonymous ? 'You choose this at checkout, with the email you give us' : email ? `To ${email}` : 'To your account email'}
                </Text>
              </View>
              {!isAnonymous && (
                <Switch
                  value={prefs.notify_email}
                  onValueChange={(v) => save('notify_email', v)}
                  disabled={savingKey === 'notify_email'}
                  trackColor={{ false: '#E7E5E4', true: RED }}
                  thumbColor="#FFFFFF"
                  accessibilityLabel="Email updates"
                />
              )}
            </View>
          </View>

          {bothOff && (
            <View className="flex-row items-start bg-amber-50 border border-amber-200 rounded-2xl px-3.5 py-3 mt-3">
              <Ionicons name="volume-mute" size={16} color="#B45309" style={{ marginTop: 1 }} />
              <Text className="text-amber-900 text-[13px] font-inter-semibold ml-2 flex-1">
                With both off, we can't tell you when your order's ready -- you'll need to check the Orders tab.
              </Text>
            </View>
          )}

          <Text className="text-xs font-inter-bold uppercase tracking-wider text-stone-500 mt-6 mb-2 px-1">
            You'll Hear From Us When
          </Text>
          <View className="bg-white rounded-2xl border border-stone-200 shadow-sm px-4 py-1">
            {[
              { icon: 'bag-check' as const, title: 'Your order is ready', sub: 'For pickup -- come and get it while it’s hot' },
              { icon: 'car' as const, title: "It's on its way", sub: 'For delivery -- it just left the store' },
              { icon: 'alert-circle' as const, title: 'Something changes', sub: 'If an order has to be cancelled' },
            ].map((row, i, all) => (
              <View
                key={row.title}
                className={`flex-row items-center py-3 ${i < all.length - 1 ? 'border-b border-stone-100' : ''}`}
              >
                <Ionicons name={row.icon} size={18} color={RED} />
                <View className="flex-1 ml-3">
                  <Text className="text-sm font-inter-semibold text-[#1C1917]">{row.title}</Text>
                  <Text className="text-xs text-[#78716C]">{row.sub}</Text>
                </View>
              </View>
            ))}
          </View>
          <Text className="text-xs text-stone-500 mt-2.5 px-1 leading-4">
            Order updates only -- no marketing. Your live order is always on the Orders tab too.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}
