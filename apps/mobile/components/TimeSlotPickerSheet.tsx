import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PickupSlot } from '../lib/orderTiming';
import { CateringDay } from '../lib/catering';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (slot: Date | null) => void;
  slots: PickupSlot[];
  asapLabel: string;
  selected: Date | null;
  // Catering mode: pick a day first, then a time on it -- and no ASAP
  // option, since catering is always scheduled ahead (see lib/catering.ts).
  // When set, slots/asapLabel are ignored.
  days?: CateringDay[];
};

// Same top-anchored overlay pattern as CountryPickerSheet -- a scrollable
// dropdown rather than a wrapped row of chips, since getPickupSlots now
// returns every 15-minute slot up to closing (could be dozens on a slow
// morning), not a handful capped to the next couple hours. A chip row would
// either wrap into a wall of buttons or hide most of the day; a dropdown
// list scales to as many options as the store's hours allow.
export default function TimeSlotPickerSheet({ visible, onClose, onSelect, slots, asapLabel, selected, days }: Props) {
  const [dayIndex, setDayIndex] = useState(0);

  // Reopening lands on the day of the time already chosen (or the first
  // open day), rather than wherever it was last left.
  useEffect(() => {
    if (!visible || !days) return;
    const chosen = selected ? days.findIndex((d) => d.date.toDateString() === selected.toDateString()) : -1;
    const firstOpen = days.findIndex((d) => !d.closed);
    setDayIndex(chosen >= 0 ? chosen : Math.max(firstOpen, 0));
  }, [visible]);

  if (!visible) return null;

  if (days) {
    const day = days[dayIndex];
    const anyOpen = days.some((d) => !d.closed);
    return (
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <TouchableOpacity
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          className="bg-[#FAF6F0] rounded-2xl mx-4 p-5"
          style={{ marginTop: 70, maxHeight: Dimensions.get('window').height - 70 - 40 }}
        >
          <View className="flex-row justify-between items-center mb-1">
            <Text className="text-xl font-inter-extrabold text-[#1C1917]">Choose a Date & Time</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={26} color="#1C1917" />
            </TouchableOpacity>
          </View>
          <Text className="text-xs text-[#78716C] mb-3">Catering is ordered by 6 PM for the next day or later.</Text>

          {!anyOpen ? (
            <Text className="text-center text-[#78716C] my-6">No catering times are available in the next two weeks.</Text>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Two weeks as a calendar grid -- every date visible at once,
                  days the store is closed shown but not selectable. */}
              <View className="flex-row flex-wrap -mx-0.5 mb-3">
                {days.map((d, i) => {
                  const active = i === dayIndex;
                  return (
                    <View key={d.date.toISOString()} style={{ width: `${100 / 7}%` }} className="p-0.5">
                      <TouchableOpacity
                        onPress={() => setDayIndex(i)}
                        disabled={d.closed}
                        className={`items-center py-2 rounded-xl border ${
                          active
                            ? 'bg-[#A61C14] border-[#A61C14]'
                            : d.closed
                            ? 'bg-stone-100 border-stone-100'
                            : 'bg-white border-stone-300'
                        }`}
                      >
                        <Text className={`text-[10px] font-inter-semibold ${active ? 'text-[#F4ECE1]' : d.closed ? 'text-stone-400' : 'text-[#78716C]'}`}>
                          {d.weekday}
                        </Text>
                        <Text className={`text-base font-inter-bold ${active ? 'text-[#F4ECE1]' : d.closed ? 'text-stone-400' : 'text-[#1C1917]'}`}>
                          {d.dayNumber}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>

              {day && (
                <>
                  <Text className="text-sm font-inter-bold text-[#1C1917]">{day.label}</Text>
                  <Text className="text-xs text-[#78716C] mb-2.5">
                    {day.closed ? 'The store is closed this day.' : `Store hours ${day.hoursLabel}`}
                  </Text>
                  <View className="flex-row flex-wrap -mx-1 pb-1">
                    {day.slots.map((slot) => {
                      const isSelected = selected?.getTime() === slot.time.getTime();
                      return (
                        <View key={slot.time.toISOString()} className="w-1/3 p-1">
                          <TouchableOpacity
                            onPress={() => onSelect(slot.time)}
                            className={`py-2.5 rounded-xl border items-center ${
                              isSelected ? 'bg-[#A61C14] border-[#A61C14]' : 'bg-white border-stone-300'
                            }`}
                          >
                            <Text className={`text-sm font-inter-semibold ${isSelected ? 'text-[#F4ECE1]' : 'text-[#1C1917]'}`}>
                              {slot.label}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                </>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <TouchableOpacity
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        activeOpacity={1}
        onPress={onClose}
      />
      <View
        className="bg-[#FAF6F0] rounded-2xl mx-4 p-5"
        style={{ marginTop: 90, maxHeight: Dimensions.get('window').height - 90 - 60 }}
      >
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-xl font-inter-extrabold text-[#1C1917]">Choose a Time</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={26} color="#1C1917" />
          </TouchableOpacity>
        </View>

        <ScrollView>
          <TouchableOpacity
            className={`flex-row items-center justify-between py-3.5 border-b border-stone-200 ${
              selected === null ? 'bg-[#FAF6F0]' : ''
            }`}
            onPress={() => onSelect(null)}
          >
            <Text className={`text-base ${selected === null ? 'font-inter-bold text-[#A61C14]' : 'text-[#1C1917]'}`}>
              ASAP (~{asapLabel})
            </Text>
            {selected === null && <Ionicons name="checkmark" size={20} color="#A61C14" />}
          </TouchableOpacity>

          {slots.map((slot) => {
            const isSelected = selected?.getTime() === slot.time.getTime();
            return (
              <TouchableOpacity
                key={slot.time.toISOString()}
                className="flex-row items-center justify-between py-3.5 border-b border-stone-100"
                onPress={() => onSelect(slot.time)}
              >
                <Text className={`text-base ${isSelected ? 'font-inter-bold text-[#A61C14]' : 'text-[#1C1917]'}`}>
                  {slot.label}
                </Text>
                {isSelected && <Ionicons name="checkmark" size={20} color="#A61C14" />}
              </TouchableOpacity>
            );
          })}

          {slots.length === 0 && (
            <Text className="text-center text-[#78716C] mt-6">
              No later times available today -- ASAP is the only option left.
            </Text>
          )}
        </ScrollView>
      </View>
    </View>
  );
}
