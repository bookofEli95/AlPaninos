import { View, Text, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PickupSlot } from '../lib/orderTiming';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (slot: Date | null) => void;
  slots: PickupSlot[];
  asapLabel: string;
  selected: Date | null;
};

// Same top-anchored overlay pattern as CountryPickerSheet -- a scrollable
// dropdown rather than a wrapped row of chips, since getPickupSlots now
// returns every 15-minute slot up to closing (could be dozens on a slow
// morning), not a handful capped to the next couple hours. A chip row would
// either wrap into a wall of buttons or hide most of the day; a dropdown
// list scales to as many options as the store's hours allow.
export default function TimeSlotPickerSheet({ visible, onClose, onSelect, slots, asapLabel, selected }: Props) {
  if (!visible) return null;

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
