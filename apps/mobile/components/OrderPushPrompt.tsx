import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { getPushPermissionStatus, registerForPushNotificationsAsync, savePushToken } from '../lib/pushNotifications';

const DISMISSED_KEY = 'pushPromptDismissed';

// "Get a notification when your order is ready" -- shown on a live order to
// a phone that hasn't been asked yet. The phone's own permission question
// only appears when they tap Turn On, at the moment it's obviously useful,
// instead of the second the app first opens (when most people say no, and
// can't easily be asked again). Nothing shows in Expo Go, where push
// doesn't work, or once they've answered or tapped Not Now.
export default function OrderPushPrompt() {
  const [visible, setVisible] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [status, dismissed] = await Promise.all([
        getPushPermissionStatus(),
        SecureStore.getItemAsync(DISMISSED_KEY).catch(() => null),
      ]);
      if (!cancelled) setVisible(status === 'undetermined' && !dismissed);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  const handleTurnOn = async () => {
    setWorking(true);
    const token = await registerForPushNotificationsAsync({ ask: true });
    if (token) await savePushToken(token);
    setWorking(false);
    setVisible(false);
  };

  const handleNotNow = () => {
    SecureStore.setItemAsync(DISMISSED_KEY, '1').catch(() => {});
    setVisible(false);
  };

  return (
    <View className="bg-white border border-stone-200 rounded-3xl p-4 mb-4 shadow-sm flex-row items-center">
      <View className="w-10 h-10 rounded-full bg-[#FAF6F0] items-center justify-center mr-3">
        <Ionicons name="notifications-outline" size={20} color="#A61C14" />
      </View>
      <View className="flex-1 mr-2">
        <Text className="text-sm font-inter-bold text-[#1C1917]">Know when it's ready</Text>
        <Text className="text-xs text-[#78716C]">Get a notification the moment your order is ready.</Text>
        <TouchableOpacity onPress={handleNotNow} className="mt-1 self-start">
          <Text className="text-[11px] text-stone-400 font-inter-semibold">Not now</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        onPress={handleTurnOn}
        disabled={working}
        className="bg-[#A61C14] px-3.5 py-2 rounded-xl active:bg-[#85140E]"
      >
        {working ? (
          <ActivityIndicator size="small" color="#F4ECE1" />
        ) : (
          <Text className="text-[#F4ECE1] font-inter-bold text-xs">Turn On</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
