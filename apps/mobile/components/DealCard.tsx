import { View, Text, Image, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { describePromoRequirements } from '../lib/promoEligibility';
import { isBundleDeal } from '../store/dealBuilderStore';

// One offer on the Deals tab, drawn as a coupon -- the shape people already
// read as "a deal I've got":
//   * left: the value, big (25% / $7 / FREE) over a real photo of the food
//     it's for -- the number is what people decide on, and food photos are
//     what make them hungry;
//   * a perforated tear line;
//   * right: what it is, any conditions, and one clear action.
// A customer's own prize (wheel / points) is gold-edged and marked
// "Your Prize" -- people value what's already theirs.

const RED = '#A61C14';
const RED_DARK = '#7A0E0A';
const GOLD = '#FFC72C';
const CREAM = '#F4ECE1';
const PAGE = '#FAF6F0';
const INK = '#1C1917';
const PANEL_WIDTH = 116;

export function dealValue(promo: any): { big: string; small: string } {
  const pct = Number(promo.discount_percent) || 0;
  const amount = Number(promo.amount_off) || 0;
  const scoped = !!(promo.category_name || promo.category_id || promo.category_names?.length);
  if (pct >= 100) return { big: 'FREE', small: scoped ? 'ITEM' : 'ORDER' };
  if (pct > 0) return { big: `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`, small: 'OFF' };
  if (amount > 0) return { big: `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}`, small: 'OFF' };
  return { big: 'DEAL', small: '' };
}

export default function DealCard({
  promo,
  index,
  photo,
  applied,
  used,
  loading,
  isItemPrize,
  notice,
  onPress,
}: {
  promo: any;
  index: number;
  photo: string | null;
  applied: boolean;
  used: boolean;
  loading: boolean;
  isItemPrize: boolean;
  // Why it doesn't fit the current order ("Pickup orders only -- you're
  // ordering delivery"): shown on the card, which is dimmed a little.
  notice?: string | null;
  onPress: () => void;
}) {
  const personal = !!promo.user_id;
  const value = dealValue(promo);
  const tags = describePromoRequirements(promo);
  // Personal deals say where they came from (see the referrals_and_birthdays
  // migration for the BDAY / FRIEND / THANKS codes).
  const code = String(promo.code ?? '').toUpperCase();
  const badge = code.startsWith('BDAY')
    ? 'BIRTHDAY TREAT'
    : code.startsWith('FRIEND')
    ? 'FRIEND GIFT'
    : code.startsWith('THANKS')
    ? 'THANK YOU'
    : 'YOUR PRIZE';
  // "Ends Oct 7" for a deal that runs out (expires_at is the moment after
  // its last day).
  const endsLabel = promo.expires_at
    ? `Ends ${new Date(new Date(promo.expires_at).getTime() - 60000).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })}`
    : null;

  // A small squeeze under the finger, so the tap feels answered.
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  // Says what happens: claim a free item, build a Mix & Match, get a deal
  // on part of the menu (applies it and opens that food), or just apply a
  // money-off-the-order deal.
  const action = used
    ? 'Redeemed'
    : applied
    ? isItemPrize
      ? 'In Cart'
      : 'Applied'
    : isItemPrize
    ? 'Claim'
    : isBundleDeal(promo)
    ? 'Build'
    : promo.category_name || promo.category_id || promo.category_names?.length
    ? 'Get Deal'
    : 'Apply';

  return (
    // The entrance and the squeeze on separate layers -- both move the card,
    // and a layout animation can override a transform on the same view.
    <Animated.View entering={FadeInDown.duration(380).delay(Math.min(index, 6) * 60)}>
      <Animated.View style={pressStyle}>
        <Pressable
          onPress={onPress}
          disabled={used || !promo.code}
          onPressIn={() => (scale.value = withSpring(0.97, { damping: 18, stiffness: 400 }))}
          onPressOut={() => (scale.value = withSpring(1, { damping: 14, stiffness: 300 }))}
          style={[
            styles.card,
            personal && styles.cardPersonal,
            applied && styles.cardApplied,
            used && { opacity: 0.5 },
            !used && !!notice && { opacity: 0.8 },
          ]}
        >
          {/* The value, over the food */}
          <View style={[styles.panel, { backgroundColor: personal ? RED_DARK : RED }]}>
            {!!photo && <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: photo ? (personal ? 'rgba(90,8,4,0.55)' : 'rgba(20,6,4,0.5)') : 'transparent' },
              ]}
            />
            <Text style={styles.valueBig} numberOfLines={1} adjustsFontSizeToFit>
              {value.big}
            </Text>
            {!!value.small && <Text style={styles.valueSmall}>{value.small}</Text>}
          </View>

          {/* Tear line, with a notch top and bottom */}
          <View style={styles.tear}>
            {Array.from({ length: 7 }).map((_, i) => (
              <View key={i} style={styles.tearDot} />
            ))}
          </View>
          <View style={[styles.notch, { top: -9 }]} />
          <View style={[styles.notch, { bottom: -9 }]} />

          {/* What it is, and what to do */}
          <View style={styles.body}>
            {personal && (
              <View style={styles.prizeBadge}>
                <Ionicons name="star" size={10} color={RED_DARK} />
                <Text style={styles.prizeBadgeText}>{badge}</Text>
              </View>
            )}
            <Text style={styles.title} numberOfLines={2}>
              {promo.title}
            </Text>
            {!!promo.description && (
              <Text style={styles.description} numberOfLines={2}>
                {promo.description}
              </Text>
            )}
            {tags.length > 0 && (
              <View style={styles.tags}>
                {tags.map((tag) => (
                  <View key={tag} style={styles.tag}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            )}
            {!used && !!notice && (
              <View style={styles.notice}>
                <Ionicons name="information-circle" size={13} color="#B45309" />
                <Text style={styles.noticeText}>{notice}</Text>
              </View>
            )}

            <View style={styles.footer}>
              <Text style={styles.code} numberOfLines={1}>
                {used
                  ? 'Already used'
                  : endsLabel ?? (isItemPrize ? 'Free menu item' : promo.code ? `Code ${promo.code}` : '')}
              </Text>
              <View
                style={[
                  styles.cta,
                  used ? styles.ctaUsed : applied ? styles.ctaApplied : personal ? styles.ctaGold : styles.ctaRed,
                ]}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={personal && !applied ? RED_DARK : CREAM} />
                ) : (
                  <>
                    {applied && <Ionicons name="checkmark" size={13} color={CREAM} style={{ marginRight: 3 }} />}
                    <Text
                      style={[styles.ctaText, { color: used ? '#A8A29E' : personal && !applied ? RED_DARK : CREAM }]}
                    >
                      {action}
                    </Text>
                    {!applied && !used && (
                      <Ionicons
                        name="arrow-forward"
                        size={13}
                        color={personal ? RED_DARK : CREAM}
                        style={{ marginLeft: 3 }}
                      />
                    )}
                  </>
                )}
              </View>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    minHeight: 136,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E7E5E4',
    marginBottom: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardPersonal: {
    borderWidth: 2,
    borderColor: GOLD,
  },
  cardApplied: {
    borderWidth: 2,
    borderColor: '#15803D',
  },
  panel: {
    width: PANEL_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  valueBig: {
    color: GOLD,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 34,
    letterSpacing: -1,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  valueSmall: {
    color: '#FFFFFF',
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 12,
    letterSpacing: 3,
    marginTop: -2,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  tear: {
    width: 2,
    marginHorizontal: 6,
    paddingVertical: 14,
    justifyContent: 'space-between',
  },
  tearDot: {
    width: 2,
    height: 6,
    borderRadius: 1,
    backgroundColor: '#E7E5E4',
  },
  notch: {
    position: 'absolute',
    left: PANEL_WIDTH + 7 - 9,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: PAGE,
  },
  body: {
    flex: 1,
    paddingVertical: 12,
    paddingRight: 12,
    paddingLeft: 4,
  },
  prizeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: GOLD,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginBottom: 5,
  },
  prizeBadgeText: {
    color: RED_DARK,
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 9,
    letterSpacing: 1,
    marginLeft: 3,
  },
  title: {
    color: INK,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 16,
    lineHeight: 20,
  },
  description: {
    color: '#78716C',
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 3,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 2,
    marginBottom: 4,
  },
  noticeText: {
    flex: 1,
    marginLeft: 4,
    color: '#B45309',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    lineHeight: 16,
  },
  tag: {
    backgroundColor: PAGE,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 5,
    marginBottom: 4,
  },
  tagText: {
    color: '#57534E',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 'auto',
    paddingTop: 8,
  },
  code: {
    flex: 1,
    marginRight: 8,
    color: '#A8A29E',
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minWidth: 84,
    justifyContent: 'center',
  },
  ctaRed: { backgroundColor: RED },
  ctaGold: { backgroundColor: GOLD },
  ctaApplied: { backgroundColor: '#15803D' },
  ctaUsed: { backgroundColor: '#F5F5F4' },
  ctaText: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 12,
  },
});
