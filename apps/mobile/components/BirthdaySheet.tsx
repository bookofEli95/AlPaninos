import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { BIRTHDAY_TREAT, MONTH_NAMES, daysInMonth } from '../lib/birthday';
import { useCartBarSpace } from '../hooks/useCartBarSpace';

// Pick a month, then a day -- no year (nobody needs to share their age for
// a sandwich). Saved once: it can't be changed from the app afterwards, so
// it can't be moved around for extra treats. A sheet from the bottom, like
// the app's other pickers.
export default function BirthdaySheet({ onClose, onSaved }: { onClose: () => void; onSaved: (month: number, day: number) => void }) {
  const insets = useSafeAreaInsets();
  // Clear of the floating View Cart bar when the cart has something in it.
  const cartBarSpace = useCartBarSpace();
  const [month, setMonth] = useState<number | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickMonth = (m: number) => {
    Haptics.selectionAsync().catch(() => {});
    setMonth(m);
    // The 31st doesn't exist in every month.
    if (day && day > daysInMonth(m)) setDay(null);
    setError(null);
  };

  const pickDay = (d: number) => {
    Haptics.selectionAsync().catch(() => {});
    setDay(d);
    setError(null);
  };

  const handleSave = async () => {
    if (!month || !day || saving) return;
    setSaving(true);
    setError(null);
    try {
      const { error: rpcError } = await (supabase as any).rpc('set_my_birthday', { p_month: month, p_day: day });
      if (rpcError) throw rpcError;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onSaved(month, day);
    } catch (e: any) {
      setError(e.message ?? "Couldn't save your birthday. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Animated.View entering={FadeIn.duration(150)} style={styles.overlay}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      <Animated.View
        entering={SlideInDown.duration(280)}
        className="bg-[#FAF6F0] rounded-t-3xl px-5 pt-3"
        style={{ maxHeight: '88%', paddingBottom: (cartBarSpace || Math.max(insets.bottom, 16)) + 8 }}
      >
        <View className="w-10 h-1 bg-stone-300 rounded-full self-center mb-3" />
        <View className="flex-row justify-between items-center mb-1">
          <Text className="text-xl font-inter-extrabold text-[#1C1917] flex-1 mr-2">When's your birthday? 🎂</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color="#1C1917" />
          </TouchableOpacity>
        </View>
        <Text className="text-[#78716C] text-sm mb-4">
          We'll celebrate with {BIRTHDAY_TREAT}, on us. Just the month and day.
        </Text>

        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          <Text className="text-xs font-inter-bold uppercase tracking-wider text-stone-500 mb-2">Month</Text>
          <View className="flex-row flex-wrap" style={{ marginHorizontal: -3 }}>
            {MONTH_NAMES.map((name, i) => {
              const selected = month === i + 1;
              return (
                <View key={name} style={{ width: '25%', padding: 3 }}>
                  <TouchableOpacity
                    onPress={() => pickMonth(i + 1)}
                    activeOpacity={0.8}
                    className={`rounded-xl py-2.5 items-center border ${
                      selected ? 'bg-[#A61C14] border-[#A61C14]' : 'bg-white border-stone-200'
                    }`}
                  >
                    <Text
                      className={`text-sm font-inter-bold ${selected ? 'text-[#F4ECE1]' : 'text-[#1C1917]'}`}
                    >
                      {name.slice(0, 3)}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          {!!month && (
            <>
              <Text className="text-xs font-inter-bold uppercase tracking-wider text-stone-500 mt-4 mb-2">Day</Text>
              <View className="flex-row flex-wrap" style={{ marginHorizontal: -3 }}>
                {Array.from({ length: daysInMonth(month) }, (_, i) => i + 1).map((d) => {
                  const selected = day === d;
                  return (
                    <View key={d} style={{ width: `${100 / 7}%`, padding: 3 }}>
                      <TouchableOpacity
                        onPress={() => pickDay(d)}
                        activeOpacity={0.8}
                        className={`rounded-lg py-2 items-center border ${
                          selected ? 'bg-[#A61C14] border-[#A61C14]' : 'bg-white border-stone-200'
                        }`}
                      >
                        <Text
                          className={`text-sm font-inter-bold ${selected ? 'text-[#F4ECE1]' : 'text-[#1C1917]'}`}
                        >
                          {d}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {!!error && (
            <View className="flex-row items-center justify-center mt-4">
              <Ionicons name="alert-circle" size={16} color="#A61C14" />
              <Text className="text-[#A61C14] text-sm font-inter-semibold ml-1.5 text-center">{error}</Text>
            </View>
          )}

          <View className="flex-row items-center justify-center mt-4 mb-3">
            <Ionicons name="lock-closed-outline" size={13} color="#78716C" />
            <Text className="text-[#78716C] text-xs font-inter-medium ml-1">
              You can only set this once, so double-check it.
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleSave}
            disabled={!month || !day || saving}
            activeOpacity={0.85}
            className={`py-4 rounded-xl items-center ${month && day ? 'bg-[#A61C14]' : 'bg-stone-300'}`}
          >
            {saving ? (
              <ActivityIndicator color="#F4ECE1" />
            ) : (
              <Text className="text-[#F4ECE1] font-inter-bold text-base">
                {month && day ? `Save ${MONTH_NAMES[month - 1]} ${day}` : 'Pick your birthday'}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
});
