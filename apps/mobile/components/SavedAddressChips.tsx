import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Alert } from '../lib/alert';
import {
  ADDRESS_LABELS,
  ADDRESS_LABEL_NAMES,
  AddressLabel,
  sameAddress,
  useSavedAddresses,
} from '../hooks/useSavedAddresses';

const RED = '#A61C14';
const ICONS: Record<AddressLabel, 'home' | 'briefcase'> = { home: 'home', work: 'briefcase' };

// The customer's saved Home / Work addresses as one-tap buttons -- the one
// being delivered to is outlined in red. Holding one down offers to remove
// it. With `offerSave`, an address that isn't saved yet gets "Save as Home /
// Work" underneath. Shows nothing for guests, or with nothing to show.
export default function SavedAddressChips({
  current,
  onPick,
  offerSave = false,
}: {
  current: string | null;
  onPick: (address: string) => void;
  offerSave?: boolean;
}) {
  const { saved, canSave, save, remove } = useSavedAddresses();
  const [savingAs, setSavingAs] = useState<AddressLabel | null>(null);

  if (!canSave) return null;
  const currentIsSaved = saved.some((s) => sameAddress(s.address, current));
  const showSaveRow = offerSave && !!current?.trim() && !currentIsSaved;
  if (saved.length === 0 && !showSaveRow) return null;

  const pick = (address: string) => {
    Haptics.selectionAsync().catch(() => {});
    onPick(address);
  };

  const confirmRemove = (label: AddressLabel) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Alert.alert(`Remove ${ADDRESS_LABEL_NAMES[label]}?`, 'You can save it again any time.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => remove(label).catch(() => Alert.alert("Couldn't remove it", 'Please try again.')),
      },
    ]);
  };

  const saveAs = (label: AddressLabel) => {
    if (!current?.trim() || savingAs) return;
    const doSave = async () => {
      setSavingAs(label);
      try {
        await save(label, current);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } catch {
        Alert.alert("Couldn't save it", 'Please check your connection and try again.');
      } finally {
        setSavingAs(null);
      }
    };
    const existing = saved.find((s) => s.label === label);
    if (existing) {
      Alert.alert(`Replace ${ADDRESS_LABEL_NAMES[label]}?`, `It's saved as ${existing.address}.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace', onPress: doSave },
      ]);
    } else {
      doSave();
    }
  };

  return (
    <View>
      {saved.length > 0 && (
        <View style={styles.row}>
          {saved.map((s) => {
            const selected = sameAddress(s.address, current);
            return (
              <TouchableOpacity
                key={s.label}
                onPress={() => pick(s.address)}
                onLongPress={() => confirmRemove(s.label)}
                activeOpacity={0.8}
                accessibilityLabel={`Deliver to ${ADDRESS_LABEL_NAMES[s.label]}, ${s.address}`}
                accessibilityHint="Hold to remove it"
                accessibilityState={{ selected }}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Ionicons name={ICONS[s.label]} size={15} color={selected ? RED : '#57534E'} />
                <View style={{ marginLeft: 7, flexShrink: 1 }}>
                  <Text className="text-[13px] font-inter-bold text-[#1C1917]">{ADDRESS_LABEL_NAMES[s.label]}</Text>
                  <Text className="text-xs text-[#78716C]" numberOfLines={1}>
                    {s.address.split(',')[0]}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {showSaveRow && (
        <View className="flex-row items-center flex-wrap mt-2">
          <Text className="text-xs font-inter-semibold text-stone-500 mr-1.5">Save this address as</Text>
          {ADDRESS_LABELS.map((label) => (
            <TouchableOpacity
              key={label}
              onPress={() => saveAs(label)}
              disabled={!!savingAs}
              activeOpacity={0.8}
              style={styles.saveChip}
            >
              {savingAs === label ? (
                <ActivityIndicator size="small" color={RED} style={{ transform: [{ scale: 0.7 }] }} />
              ) : (
                <Ionicons name={ICONS[label]} size={12} color={RED} />
              )}
              <Text className="text-xs font-inter-bold text-[#A61C14] ml-1">{ADDRESS_LABEL_NAMES[label]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E7E5E4',
    backgroundColor: '#FFFFFF',
  },
  chipSelected: {
    borderColor: RED,
    backgroundColor: '#FBF1F0',
  },
  saveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 26,
    paddingHorizontal: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#F0B4AC',
    backgroundColor: '#FFFFFF',
    marginRight: 6,
  },
});
