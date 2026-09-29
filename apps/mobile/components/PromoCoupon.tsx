import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { AppliedPromo } from '../store/promoStore';
import { dealValue } from './DealCard';

// The deal on the cart, as a small coupon (the Deals tab's look):
//   * unlocked -- the value, the deal, and "You save $4.20" in green, so the
//     saving is seen right where the money is;
//   * not unlocked yet -- a progress bar toward it ("$4.50 more to unlock"):
//     the closer people see they are, the more they'll add to get there.
// A free reward item in the cart (wheel / points prize) shows as a gold one.

const RED = '#A61C14';
const RED_DARK = '#7A0E0A';
const GOLD = '#FFC72C';
const GREEN = '#15803D';

export default function PromoCoupon({
  promo,
  code,
  saved,
  unmetReason,
  paidSubtotal,
  onRemove,
}: {
  promo: AppliedPromo | null;
  code: string;
  saved: number;
  unmetReason: string | null;
  paidSubtotal: number;
  onRemove: () => void;
}) {
  // How close the cart is to unlocking the deal, 0..1 -- from the minimum
  // order ($), or from how many more items the reason asks for (buy 2+).
  let progress: number | null = null;
  if (promo && unmetReason) {
    if (promo.minOrderAmount && paidSubtotal < promo.minOrderAmount) {
      progress = paidSubtotal / promo.minOrderAmount;
    } else if (promo.minItemCount) {
      const missing = Number(unmetReason.match(/Add (\d+) more item/)?.[1] ?? NaN);
      if (!Number.isNaN(missing)) progress = Math.max(0, promo.minItemCount - missing) / promo.minItemCount;
    }
  }

  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withTiming(progress ?? 0, { duration: 500, easing: Easing.out(Easing.cubic) });
  }, [progress, fill]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  // A free reward item (no applied promo, just a reward line in the cart).
  if (!promo) {
    return (
      <View style={[styles.coupon, { borderColor: GOLD }]}>
        <View style={[styles.value, { backgroundColor: RED_DARK }]}>
          <Text style={styles.valueBig}>FREE</Text>
          <Text style={styles.valueSmall}>ITEM</Text>
        </View>
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            Your reward is in the cart
          </Text>
          <Text style={styles.sub}>It's on us -- enjoy!</Text>
        </View>
        <Remove onPress={onRemove} />
      </View>
    );
  }

  const value = dealValue({
    discount_percent: promo.discountPercent,
    amount_off: promo.amountOff,
    category_id: promo.categoryId,
    category_name: promo.categoryName,
    category_names: promo.categoryNames,
  });
  const unlocked = saved > 0;

  return (
    <View style={[styles.coupon, { borderColor: unlocked ? GREEN : '#E7E5E4' }]}>
      <View style={[styles.value, { backgroundColor: unlocked ? RED : '#78716C' }]}>
        <Text style={styles.valueBig} numberOfLines={1} adjustsFontSizeToFit>
          {value.big}
        </Text>
        {!!value.small && <Text style={styles.valueSmall}>{value.small}</Text>}
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {promo.title || `Code ${code}`}
        </Text>
        {unlocked ? (
          <View style={styles.row}>
            <Ionicons name="checkmark-circle" size={15} color={GREEN} />
            <Text style={[styles.sub, { color: GREEN, fontFamily: 'Inter_800ExtraBold' }]}>
              {' '}You save ${saved.toFixed(2)}
            </Text>
          </View>
        ) : (
          <>
            {progress != null && (
              <View style={styles.track}>
                <Animated.View style={[styles.trackFill, fillStyle]} />
              </View>
            )}
            <View style={[styles.row, { alignItems: 'flex-start' }]}>
              <Ionicons name="lock-closed" size={12} color="#B45309" style={{ marginTop: 2 }} />
              <Text style={[styles.sub, { color: '#B45309', marginLeft: 4, flex: 1 }]}>
                {unmetReason ?? 'Checking this deal...'}
              </Text>
            </View>
          </>
        )}
      </View>
      <Remove onPress={onRemove} />
    </View>
  );
}

function Remove({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.remove}>
      <Ionicons name="close-circle" size={22} color="#A8A29E" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  coupon: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 2,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  value: {
    width: 76,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  valueBig: {
    color: GOLD,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 22,
  },
  valueSmall: {
    color: '#FFFFFF',
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 10,
    letterSpacing: 2,
  },
  body: {
    flex: 1,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 4,
    justifyContent: 'center',
  },
  title: {
    color: '#1C1917',
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 15,
  },
  sub: {
    color: '#57534E',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    marginTop: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F5F5F4',
    overflow: 'hidden',
    marginTop: 7,
    marginBottom: 2,
  },
  trackFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: RED,
  },
  remove: {
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
});
