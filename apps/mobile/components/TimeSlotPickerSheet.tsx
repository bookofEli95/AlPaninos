import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, ScrollView, Dimensions, StyleSheet } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { OrderDay, PickupSlot } from '../lib/orderTiming';
import { CateringDay } from '../lib/catering';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (slot: Date | null) => void;
  // Regular orders: the times the store can have it ready, by day
  // (lib/orderTiming getOrderDays), and whether "ASAP" is possible right
  // now -- it isn't while the store is closed.
  orderDays: OrderDay[];
  asapAvailable: boolean;
  asapLabel: string;
  selected: Date | null;
  // Catering mode: pick a day first, then a time on it -- and no ASAP
  // option, since catering is always scheduled ahead (see lib/catering.ts).
  // When set, orderDays/asapLabel are ignored.
  days?: CateringDay[];
};

const RED = '#A61C14';
const SCREEN_HEIGHT = Dimensions.get('window').height;

// The times of one day, split into Morning / Afternoon / Evening so a long
// day reads at a glance.
function partsOfDay(slots: PickupSlot[]) {
  const parts = [
    { title: 'Morning', slots: [] as PickupSlot[] },
    { title: 'Afternoon', slots: [] as PickupSlot[] },
    { title: 'Evening', slots: [] as PickupSlot[] },
  ];
  slots.forEach((slot) => {
    const hour = slot.time.getHours();
    parts[hour < 12 ? 0 : hour < 17 ? 1 : 2].slots.push(slot);
  });
  return parts.filter((p) => p.slots.length > 0);
}

// "Today", "Tomorrow", or "Sat 4" -- short enough for a tab.
function tabLabel(day: { date: Date; label: string }) {
  if (day.label === 'Today' || day.label === 'Tomorrow') return day.label;
  return `${day.date.toLocaleDateString([], { weekday: 'short' })} ${day.date.getDate()}`;
}

// When the order should be ready: a sheet that slides up from the bottom
// (like the Pickup / Delivery one). A regular order offers ASAP (while the
// store's open) or a day's tab and its times as a grid; catering offers a
// two-week calendar and the chosen day's times. Picking a time only changes
// its colours, so nothing on the grid moves.
export default function TimeSlotPickerSheet({
  visible,
  onClose,
  onSelect,
  orderDays,
  asapAvailable,
  asapLabel,
  selected,
  days,
}: Props) {
  const insets = useSafeAreaInsets();
  const [dayIndex, setDayIndex] = useState(0);

  // Reopening lands on the day of the time already chosen (or the first
  // day that has times), rather than wherever it was last left.
  useEffect(() => {
    if (!visible) return;
    const list: { date: Date; closed?: boolean }[] = days ?? orderDays;
    const chosen = selected ? list.findIndex((d) => d.date.toDateString() === selected.toDateString()) : -1;
    const firstOpen = list.findIndex((d) => !d.closed);
    setDayIndex(chosen >= 0 ? chosen : Math.max(firstOpen, 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // ---- Slide up / down -----------------------------------------------------
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
    } else if (mounted) {
      progress.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic) }, (done) => {
        if (done) runOnJS(setMounted)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.value) * SCREEN_HEIGHT * 0.7 }] }));

  if (!mounted) return null;

  const pick = (slot: Date | null) => {
    Haptics.selectionAsync().catch(() => {});
    onSelect(slot);
  };
  const pickDay = (index: number) => {
    Haptics.selectionAsync().catch(() => {});
    setDayIndex(index);
  };

  const timeGrid = (slots: PickupSlot[]) => (
    <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
      {slots.map((slot) => {
        const isSelected = selected?.getTime() === slot.time.getTime();
        return (
          <View key={slot.time.toISOString()} style={{ width: '33.333%', padding: 4 }}>
            <TouchableOpacity
              onPress={() => pick(slot.time)}
              activeOpacity={0.8}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              style={[styles.chip, isSelected && styles.chipActive]}
            >
              <Text className="text-sm font-inter-semibold" style={{ color: isSelected ? '#F4ECE1' : '#1C1917' }}>
                {slot.label}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );

  const header = (title: string, subtitle?: string) => (
    <View className="mb-3">
      <View className="flex-row justify-between items-center">
        <Text className="text-xl font-display-bold text-[#1C1917] flex-1 mr-2">{title}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Close">
          <Ionicons name="close" size={24} color="#1C1917" />
        </TouchableOpacity>
      </View>
      {!!subtitle && <Text className="text-[13px] text-[#78716C] mt-0.5">{subtitle}</Text>}
    </View>
  );

  let body: React.ReactNode;
  if (days) {
    // ---- Catering: a two-week calendar, then the day's times -------------
    const day = days[dayIndex];
    const anyOpen = days.some((d) => !d.closed);
    body = (
      <>
        {header('Choose a Date & Time', 'Catering is ordered by 6 PM for the next day or later.')}
        {!anyOpen ? (
          <Text className="text-center text-[#78716C] my-6">No catering times are available in the next two weeks.</Text>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
            {/* Every date visible at once; days the store is closed shown
                but not selectable. */}
            <View className="flex-row flex-wrap mb-3" style={{ marginHorizontal: -2 }}>
              {days.map((d, i) => {
                const active = i === dayIndex;
                return (
                  <View key={d.date.toISOString()} style={{ width: `${100 / 7}%`, padding: 2 }}>
                    <TouchableOpacity
                      onPress={() => pickDay(i)}
                      disabled={d.closed}
                      style={[
                        styles.dateTile,
                        active ? styles.chipActive : d.closed ? styles.dateClosed : null,
                      ]}
                    >
                      <Text
                        className="text-[11px] font-inter-semibold"
                        style={{ color: active ? '#F4ECE1' : d.closed ? '#A8A29E' : '#78716C' }}
                      >
                        {d.weekday}
                      </Text>
                      <Text
                        className="text-base font-inter-bold"
                        style={{ color: active ? '#F4ECE1' : d.closed ? '#A8A29E' : '#1C1917' }}
                      >
                        {d.dayNumber}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>

            {day && (
              <>
                <Text className="text-[15px] font-inter-bold text-[#1C1917]">{day.label}</Text>
                <Text className="text-[13px] text-[#78716C] mb-2">
                  {day.closed ? 'The store is closed this day.' : `Store hours ${day.hoursLabel}`}
                </Text>
                {partsOfDay(day.slots).map((part) => (
                  <View key={part.title} className="mb-2">
                    <Text className="text-xs font-inter-bold uppercase tracking-wider text-stone-500 mb-1 mt-1">
                      {part.title}
                    </Text>
                    {timeGrid(part.slots)}
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        )}
      </>
    );
  } else {
    // ---- Regular: ASAP, or a day's tab and its times ----------------------
    const day = orderDays[dayIndex] ?? orderDays[0];
    const asapChosen = asapAvailable && selected === null;
    body = (
      <>
        {header('When do you want it?')}
        <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
          {asapAvailable ? (
            <TouchableOpacity
              onPress={() => pick(null)}
              activeOpacity={0.85}
              accessibilityRole="radio"
              accessibilityState={{ checked: asapChosen }}
              style={[styles.asap, asapChosen && styles.asapActive]}
            >
              <View
                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: asapChosen ? RED : '#FAF6F0' }}
              >
                <Ionicons name="flash" size={18} color={asapChosen ? '#FFC72C' : RED} />
              </View>
              <View className="flex-1">
                <Text className="text-[15px] font-inter-bold text-[#1C1917]">As soon as possible</Text>
                <Text className="text-[13px] text-[#78716C]">Ready in about {asapLabel}</Text>
              </View>
              <View style={[styles.radio, asapChosen && { borderColor: RED }]}>
                {asapChosen && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          ) : (
            <View className="flex-row items-center bg-amber-50 border border-amber-200 rounded-2xl px-3.5 py-3">
              <Ionicons name="moon" size={16} color="#B45309" />
              <Text className="text-amber-900 text-sm font-inter-semibold ml-2 flex-1">
                We're closed right now -- pick a time when we're open.
              </Text>
            </View>
          )}

          {orderDays.length > 0 && day ? (
            <>
              <Text className="text-xs font-inter-bold uppercase tracking-wider text-stone-500 mt-5 mb-2">
                {asapAvailable ? 'Or schedule it' : 'Schedule it'}
              </Text>

              {/* Today / Tomorrow / Sat 4 */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3" style={{ flexGrow: 0 }}>
                {orderDays.map((d, i) => {
                  const active = i === dayIndex;
                  return (
                    <TouchableOpacity
                      key={d.date.toISOString()}
                      onPress={() => pickDay(i)}
                      activeOpacity={0.85}
                      style={[styles.tab, active && styles.tabActive]}
                    >
                      <Text className="text-sm font-inter-bold" style={{ color: active ? '#F4ECE1' : '#1C1917' }}>
                        {tabLabel(d)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {partsOfDay(day.slots).map((part) => (
                <View key={part.title} className="mb-2">
                  <Text className="text-xs font-inter-bold uppercase tracking-wider text-stone-500 mb-1">
                    {part.title}
                  </Text>
                  {timeGrid(part.slots)}
                </View>
              ))}
            </>
          ) : (
            <Text className="text-center text-[#78716C] mt-6 mb-2">
              {asapAvailable
                ? 'No later times today -- ASAP is the only option.'
                : 'No times are available right now. Please check back later.'}
            </Text>
          )}
        </ScrollView>
      </>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View style={[styles.sheetWrap, sheetStyle]}>
        <View
          className="bg-[#FAF6F0] rounded-t-3xl px-5 pt-3"
          style={{ maxHeight: SCREEN_HEIGHT * 0.85, paddingBottom: Math.max(insets.bottom, 16) + 8 }}
        >
          <View className="w-10 h-1 bg-stone-300 rounded-full self-center mb-3" />
          {body}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  chip: {
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D6D3D1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: RED,
    borderColor: RED,
  },
  dateTile: {
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D6D3D1',
    backgroundColor: '#FFFFFF',
  },
  dateClosed: {
    backgroundColor: '#F5F5F4',
    borderColor: '#F5F5F4',
  },
  asap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E7E5E4',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  asapActive: {
    borderColor: RED,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#D6D3D1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: RED,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D6D3D1',
    backgroundColor: '#FFFFFF',
    marginRight: 8,
  },
  tabActive: {
    backgroundColor: '#1C1917',
    borderColor: '#1C1917',
  },
});
