import { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, Image, StyleSheet, Pressable } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { appliedPromoFromRow, evaluatePromo } from '../lib/promoEligibility';
import { requiredMeals, useDealBuilderStore } from '../store/dealBuilderStore';
import { useCartStore } from '../store/cartStore';
import { dealValue } from './DealCard';

// Building a Mix & Match deal, meal by meal:
//   * a progress bar to the deal ("1 of 2 -- pick 1 more to unlock 20% off")
//     -- people push harder the closer they are to a goal;
//   * one slot per meal: empty ones invite a tap, filled ones show the dish,
//     its options and its price;
//   * "Add another meal" -- every extra meal is discounted too;
//   * the price with the saving struck through, so the value is seen, not
//     just promised;
//   * one button, which only lights up once the deal is complete.

const RED = '#A61C14';
const RED_DARK = '#7A0E0A';
const GOLD = '#FFC72C';
const CREAM = '#F4ECE1';
const INK = '#1C1917';
const GREEN = '#15803D';

const money = (n: number) => `$${n.toFixed(2)}`;

export default function DealBuilderSheet({
  visible,
  onPickMeal,
  onConfirmed,
}: {
  visible: boolean;
  onPickMeal: (slot: number) => void;
  onConfirmed: (summary: { promo: any; meals: number; saved: number }) => void;
}) {
  const insets = useSafeAreaInsets();
  const { promo, meals, clearMeal, addSlot, removeSlot, reset } = useDealBuilderStore();
  const orderType = useCartStore((state) => state.orderType);
  const addItem = useCartStore((state) => state.addItem);

  const filled = meals.filter(Boolean) as NonNullable<(typeof meals)[number]>[];
  const needed = promo ? requiredMeals(promo) : 2;
  const complete = filled.length >= needed && filled.length === meals.length;
  const lines = filled.map((m) => m.item);
  const regular = lines.reduce((sum, line) => sum + line.totalPrice, 0);
  // Every meal here is from the deal's own categories, so only the deal's
  // other rules (and a named-items list, by each meal's name) are checked.
  const infoMap = Object.fromEntries(lines.map((l) => [l.menuItemId, { categoryId: '', name: l.name }]));
  const evaluation =
    promo && filled.length >= needed ? evaluatePromo(lines, appliedPromoFromRow(promo), null, infoMap, orderType) : null;
  const saved = evaluation?.discount ?? 0;
  const value = promo ? dealValue(promo) : { big: '', small: '' };
  const offLabel = `${value.big} ${value.small}`.trim();

  const [confirmLeave, setConfirmLeave] = useState(false);
  useEffect(() => {
    if (!visible) setConfirmLeave(false);
  }, [visible]);

  // The bar fills as meals go in; a little pulse when the deal unlocks.
  const progress = useSharedValue(0);
  const pulse = useSharedValue(1);
  const target = Math.min(filled.length / needed, 1);
  const unlocked = filled.length >= needed;
  useEffect(() => {
    progress.value = withTiming(target, { duration: 450, easing: Easing.out(Easing.cubic) });
  }, [target, progress]);
  useEffect(() => {
    if (!unlocked || !visible) return;
    pulse.value = withSequence(withTiming(1.06, { duration: 140 }), withTiming(1, { duration: 220 }));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [unlocked, visible, pulse]);
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  // The sheet slides up each time the builder is shown.
  const slide = useSharedValue(600);
  useEffect(() => {
    if (!visible) {
      slide.value = 600;
      return;
    }
    slide.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
  }, [visible, slide]);
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: slide.value }] }));
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  if (!promo) return null;

  // Leaving with meals picked asks first -- drawn inside this sheet, since
  // the app's own popups sit beneath a Modal.
  const close = () => {
    if (confirmLeave) {
      setConfirmLeave(false);
      return;
    }
    if (!filled.length) {
      reset();
      return;
    }
    setConfirmLeave(true);
  };

  const confirm = () => {
    if (!complete) return;
    const locationId = filled[0].locationId;
    filled.forEach((meal) =>
      addItem({ ...meal.item, cartItemId: Math.random().toString(36).substring(2, 9) }, meal.locationId || locationId)
    );
    const summary = { promo, meals: filled.length, saved };
    reset();
    onConfirmed(summary);
  };

  const status = unlocked
    ? `Unlocked! ${offLabel} ${filled.length === 1 ? 'this meal' : `all ${filled.length} meals`}`
    : `${filled.length} of ${needed} picked -- ${needed - filled.length} more to unlock ${offLabel}`;

  return (
    // No layout ("entering") animations in here: inside a Modal on iPhone
    // they can leave the whole sheet not answering taps. The Modal fades the
    // backdrop in and the sheet slides up on an animated style instead.
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <Animated.View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }, sheetStyle]}>
          {/* Header: the deal, and a way out */}
          <View style={styles.header}>
            <View style={styles.valueChip}>
              <Text style={styles.valueChipText}>{offLabel}</Text>
            </View>
            <View style={{ flex: 1, marginHorizontal: 10 }}>
              <Text style={styles.title} numberOfLines={2}>
                {promo.title}
              </Text>
            </View>
            <TouchableOpacity onPress={close} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.closeButton}>
              <Ionicons name="close" size={22} color={INK} />
            </TouchableOpacity>
          </View>

          {/* Progress to the deal */}
          <Animated.View style={pulseStyle}>
            <View style={styles.track}>
              <Animated.View style={[styles.trackFill, { backgroundColor: unlocked ? GREEN : RED }, barStyle]} />
            </View>
            <View style={styles.statusRow}>
              <Ionicons
                name={unlocked ? 'lock-open' : 'lock-closed'}
                size={14}
                color={unlocked ? GREEN : '#78716C'}
              />
              <Text style={[styles.status, { color: unlocked ? GREEN : '#57534E' }]}>{status}</Text>
            </View>
          </Animated.View>

          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ paddingTop: 6 }} showsVerticalScrollIndicator={false}>
            {meals.map((meal, i) => {
              const extra = i >= needed;
              if (!meal) {
                return (
                  <View key={`slot-${i}`}>
                    <TouchableOpacity onPress={() => onPickMeal(i)} activeOpacity={0.8} style={styles.emptySlot}>
                      <View style={styles.emptyIcon}>
                        <Ionicons name="add" size={24} color={RED} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.slotLabel}>Meal {i + 1}</Text>
                        <Text style={styles.emptyHint}>Tap to choose your sandwich or wrap</Text>
                      </View>
                      {extra ? (
                        <TouchableOpacity onPress={() => removeSlot(i)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                          <Ionicons name="close-circle" size={22} color="#A8A29E" />
                        </TouchableOpacity>
                      ) : (
                        <Ionicons name="chevron-forward" size={20} color={RED} />
                      )}
                    </TouchableOpacity>
                  </View>
                );
              }
              const options = meal.item.modifiers.map((m) => m.name).join(', ');
              return (
                <View key={`slot-${i}`}>
                  <View style={styles.filledSlot}>
                    {meal.item.imageUrl ? (
                      <Image source={{ uri: meal.item.imageUrl }} style={styles.mealPhoto} />
                    ) : (
                      <View style={[styles.mealPhoto, { alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="restaurant" size={22} color="#A8A29E" />
                      </View>
                    )}
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="checkmark-circle" size={14} color={GREEN} />
                        <Text style={[styles.slotLabel, { marginLeft: 4 }]}>Meal {i + 1}</Text>
                      </View>
                      <Text style={styles.mealName} numberOfLines={1}>
                        {meal.item.name}
                      </Text>
                      {!!options && (
                        <Text style={styles.mealOptions} numberOfLines={2}>
                          {options}
                        </Text>
                      )}
                      {!!meal.item.specialInstructions && (
                        <Text style={styles.mealOptions} numberOfLines={1}>
                          "{meal.item.specialInstructions}"
                        </Text>
                      )}
                      <View style={styles.mealActions}>
                        <Text style={styles.mealPrice}>{money(meal.item.totalPrice)}</Text>
                        <TouchableOpacity onPress={() => onPickMeal(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Text style={styles.changeLink}>Change</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => (extra ? removeSlot(i) : clearMeal(i))}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          style={{ marginLeft: 14 }}
                        >
                          <Ionicons name="trash-outline" size={16} color="#A8A29E" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}

            {/* More meals, more savings */}
            <TouchableOpacity onPress={addSlot} activeOpacity={0.8} style={styles.addMore}>
              <Ionicons name="add-circle" size={20} color={RED} />
              <Text style={styles.addMoreText}>Add Another Meal</Text>
              <View style={styles.addMoreChip}>
                <Text style={styles.addMoreChipText}>also {offLabel.toLowerCase()}</Text>
              </View>
            </TouchableOpacity>
          </ScrollView>

          {/* The price, with the saving shown */}
          {filled.length > 0 && (
            <View style={styles.totals}>
              <Text style={styles.totalsLabel}>
                {filled.length} {filled.length === 1 ? 'meal' : 'meals'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                {saved > 0 && <Text style={styles.wasPrice}>{money(regular)}</Text>}
                <Text style={styles.nowPrice}>{money(regular - saved)}</Text>
              </View>
            </View>
          )}
          {saved > 0 && (
            <Text style={styles.savedLine}>You save {money(saved)}</Text>
          )}

          <TouchableOpacity
            onPress={confirm}
            disabled={!complete}
            activeOpacity={0.9}
            style={[styles.confirm, { backgroundColor: complete ? RED : '#D6D3D1' }]}
          >
            <Text style={[styles.confirmText, { color: complete ? CREAM : '#78716C' }]}>
              {complete
                ? `Confirm & Add to Cart · ${money(regular - saved)}`
                : filled.length < needed
                ? `Pick ${needed - filled.length} more ${needed - filled.length === 1 ? 'meal' : 'meals'}`
                : 'Choose your extra meal, or remove it'}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {confirmLeave && (
          <View style={styles.leaveBackdrop}>
            <View style={styles.leaveCard}>
              <View style={styles.leaveAccent} />
              <Text style={styles.leaveTitle}>Leave This Deal?</Text>
              <Text style={styles.leaveMessage}>The meals you've picked won't be kept.</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                <TouchableOpacity
                  onPress={() => setConfirmLeave(false)}
                  style={[styles.leaveButton, { backgroundColor: '#EFE6DA' }]}
                >
                  <Text style={[styles.leaveButtonText, { color: INK }]}>Keep Building</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setConfirmLeave(false);
                    reset();
                  }}
                  style={[styles.leaveButton, { backgroundColor: RED }]}
                >
                  <Text style={[styles.leaveButtonText, { color: CREAM }]}>Leave</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  leaveBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(12,6,4,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  leaveCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FAF6F0',
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 20,
    overflow: 'hidden',
  },
  leaveAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
    backgroundColor: RED,
  },
  leaveTitle: {
    color: INK,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 20,
    textAlign: 'center',
  },
  leaveMessage: {
    color: '#57534E',
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 8,
  },
  leaveButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
  },
  leaveButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12,6,4,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FAF6F0',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  valueChip: {
    backgroundColor: RED,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  valueChipText: {
    color: GOLD,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 15,
  },
  title: {
    color: INK,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 18,
    lineHeight: 22,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EFE6DA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E7E5E4',
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 5,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 7,
    marginBottom: 8,
  },
  status: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    marginLeft: 5,
    flex: 1,
  },
  emptySlot: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#D6A8A2',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FBE9E7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  slotLabel: {
    color: RED,
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  emptyHint: {
    color: '#57534E',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    marginTop: 2,
  },
  filledSlot: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E7E5E4',
    padding: 12,
    marginBottom: 10,
  },
  mealPhoto: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: '#F5F5F4',
  },
  mealName: {
    color: INK,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 16,
    marginTop: 2,
  },
  mealOptions: {
    color: '#78716C',
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  mealActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  mealPrice: {
    color: INK,
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    flex: 1,
  },
  changeLink: {
    color: RED,
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  addMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 6,
  },
  addMoreText: {
    color: RED,
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 15,
    marginLeft: 6,
  },
  addMoreChip: {
    backgroundColor: GOLD,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  addMoreChipText: {
    color: RED_DARK,
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 10,
  },
  totals: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#E7E5E4',
    paddingTop: 12,
  },
  totalsLabel: {
    color: '#57534E',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  wasPrice: {
    color: '#A8A29E',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    textDecorationLine: 'line-through',
    marginRight: 8,
  },
  nowPrice: {
    color: INK,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 22,
  },
  savedLine: {
    color: GREEN,
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 13,
    textAlign: 'right',
    marginTop: 2,
  },
  confirm: {
    marginTop: 12,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmText: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 16,
  },
});
