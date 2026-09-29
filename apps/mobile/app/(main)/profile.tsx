import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, Alert, Image, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { setStatusBarStyle } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useLocationStore } from '../../store/locationStore';
import { useCartStore } from '../../store/cartStore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PrizeItemPicker from '../../components/PrizeItemPicker';
import {
  EligiblePrizeItem,
  fetchEligiblePrizeItems,
  fetchPrizeShowcaseImage,
  isPickAnItemPrize,
  itemHasModifiers,
} from '../../lib/prizeRedemption';
import { formatPhoneNumber, parsePhone } from '../../lib/countries';
import AccountSetupSheet from '../../components/AccountSetupSheet';
import GuestJoinCard from '../../components/GuestJoinCard';
import { confirmSwitchToExistingAccount, signOutToLogin, welcomeNewAccount } from '../../lib/guestSession';
import { useProfile } from '../../hooks/useProfile';
import { needsPassword } from '../../lib/account';
import { useCartBarSpace } from '../../hooks/useCartBarSpace';

const RED = '#A61C14';
const RED_DARK = '#85140E';
const GOLD = '#FFC72C';
const CREAM = '#F4ECE1';
const INK = '#1C1917';

// Same costs and tiers as redeem_points_reward() (the panino_points
// migration) -- the server is the source of truth, this is display only.
// The track on the points card is drawn to scale: 300 sits a quarter of the
// way along, 600 halfway, 1,200 at the end.
const REWARD_TIERS: {
  tier: string;
  cost: number;
  short: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { tier: 'beverage', cost: 300, short: 'Free Drink', title: 'Free Beverage', icon: 'cafe' },
  { tier: 'specialty_side', cost: 600, short: 'Free Side', title: 'Free Specialty Side', icon: 'fast-food' },
  { tier: 'sandwich', cost: 1200, short: 'Free Sandwich', title: 'Free Signature Sandwich', icon: 'restaurant' },
];
const TOP_TIER = REWARD_TIERS[REWARD_TIERS.length - 1].cost;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function memberSince(createdAt?: string): string | null {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) return null;
  return `Member since ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// The points balance counts up from 0 each time Profile comes into view.
// Only this little Text re-renders while it counts.
function PointsCounter({ value, playKey }: { value: number; playKey: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (value <= 0) {
      setShown(0);
      return;
    }
    let frame = 0;
    let startAt: number | null = null;
    const tick = (t: number) => {
      if (startAt == null) startAt = t;
      const p = Math.min(1, (t - startAt) / 900);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, playKey]);
  return <Text style={styles.pointsNumber}>{shown.toLocaleString()}</Text>;
}

// A diagonal gradient filling its parent. Drawn at the parent's measured
// size: an Svg sized "100%" can be laid out before the parent's final size
// is known and then only covers part of it.
function GradientFill({ id, x2, stops }: { id: string; x2: number; stops: [string, string][] }) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((old) => (old && old.width === width && old.height === height ? old : { width, height }));
      }}
    >
      {size && (
        <Svg width={size.width} height={size.height}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2={String(x2)} y2="1">
              {stops.map(([offset, color]) => (
                <Stop key={offset} offset={offset} stopColor={color} />
              ))}
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size.width} height={size.height} fill={`url(#${id})`} />
        </Svg>
      )}
    </View>
  );
}

// One row of the Account list.
function AccountRow({
  icon,
  label,
  detail,
  onPress,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string | null;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className={`flex-row items-center px-4 py-3.5 ${last ? '' : 'border-b border-stone-100'}`}
    >
      <View className="w-9 h-9 rounded-xl bg-[#FAF6F0] items-center justify-center mr-3">
        <Ionicons name={icon} size={18} color={RED} />
      </View>
      <View className="flex-1 mr-2">
        <Text className="text-[15px] font-inter-semibold text-[#1C1917]">{label}</Text>
        {!!detail && (
          <Text className="text-xs text-[#78716C] mt-0.5" numberOfLines={1}>
            {detail}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color="#A8A29E" />
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const cartBarSpace = useCartBarSpace();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuthStore();
  const userId = session?.user?.id;
  const locationId = useLocationStore(state => state.locationId);
  const isAnonymous = session?.user?.is_anonymous ?? false;
  const [setupVisible, setSetupVisible] = useState(false);

  const { data: profile, isLoading } = useProfile();

  const { data: wheelPromo } = useQuery({
    queryKey: ['wheelPromo', userId, profile?.wheel_prize_code],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('promotions')
        .select('*')
        .eq('code', profile!.wheel_prize_code)
        .eq('user_id', userId!)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !isAnonymous && !!userId && !!profile?.wheel_prize_code,
  });

  // A photo of what was won, for the prize ticket -- the same picture the
  // wheel's win card showed. Whole-order prizes (25% off, the Grand Prize)
  // have no category, so they get an icon instead.
  const { data: prizeImage } = useQuery({
    queryKey: ['prizeShowcase', wheelPromo?.code],
    queryFn: () => fetchPrizeShowcaseImage(wheelPromo!.category_name, wheelPromo!.item_name_patterns),
    enabled: !!wheelPromo?.category_name,
    staleTime: Infinity,
  });

  // Shared with Home's "Your usual" card (same key and query).
  const { data: usualItem } = useQuery({
    queryKey: ['usualItem', userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_usual_item');
      if (error) throw error;
      return data?.[0] ?? null;
    },
    enabled: !isAnonymous && !!userId,
  });

  const { data: orderCount } = useQuery({
    queryKey: ['orderCount', userId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId!);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !isAnonymous && !!userId,
  });

  const scrollViewRef = useRef<ScrollView>(null);
  const [playKey, setPlayKey] = useState(0);
  const shine = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: ['profile', userId] });
      queryClient.invalidateQueries({ queryKey: ['wheelPromo', userId] });
      // Checkout doesn't invalidate these, so without this they'd stay
      // stale after placing a new order.
      queryClient.invalidateQueries({ queryKey: ['orderCount', userId] });
      queryClient.invalidateQueries({ queryKey: ['usualItem', userId] });
      if (isAnonymous) return;
      // The header is dark, so light status bar text while Profile shows.
      setStatusBarStyle('light');
      setPlayKey((k) => k + 1);
      shine.value = 0;
      shine.value = withDelay(500, withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.cubic) }));
      return () => setStatusBarStyle('dark');
    }, [userId, isAnonymous, queryClient, shine])
  );

  const shineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -140 + shine.value * 560 }, { skewX: '-20deg' }],
    opacity: shine.value > 0 && shine.value < 1 ? 1 : 0,
  }));

  const [copied, setCopied] = useState(false);
  const handleCopyCode = async (code: string) => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const items = useCartStore(state => state.items);
  const addFreeItem = useCartStore(state => state.addFreeItem);
  const removeItemsByPromoCode = useCartStore(state => state.removeItemsByPromoCode);
  const [resolvingPrize, setResolvingPrize] = useState(false);
  const [picker, setPicker] = useState<{ promo: any; items: EligiblePrizeItem[] } | null>(null);

  const giveFreeItem = (target: EligiblePrizeItem, promo: any) => {
    itemHasModifiers(target.id).then((hasModifiers) => {
      if (hasModifiers) {
        router.push({
          pathname: `/(main)/item/${target.id}`,
          params: { promoCode: promo.code, promoTitle: promo.title },
        });
      } else if (locationId) {
        addFreeItem(
          { menuItemId: target.id, name: target.name, basePrice: target.base_price, imageUrl: target.image_url },
          locationId,
          promo.code
        );
        Alert.alert('Added!', `${target.name} was added to your cart -- it's free.`);
      }
    });
  };

  const resolveAndRedeem = async (promo: any) => {
    if (!locationId) {
      Alert.alert('Choose a Location', 'Pick a location from the menu first, then come back to redeem this.');
      return;
    }
    setResolvingPrize(true);
    try {
      const eligibleItems = await fetchEligiblePrizeItems(promo, locationId);
      if (eligibleItems.length === 0) {
        Alert.alert('Not Available', "This prize isn't available at this location right now.");
      } else if (eligibleItems.length === 1) {
        giveFreeItem(eligibleItems[0], promo);
      } else {
        setPicker({ promo, items: eligibleItems });
      }
    } finally {
      setResolvingPrize(false);
    }
  };

  const prizeInCart = !!wheelPromo && items.some((i) => i.promoCode === wheelPromo.code);

  const handlePressPrize = () => {
    if (!wheelPromo) return;
    if (!isPickAnItemPrize(wheelPromo)) {
      handleCopyCode(wheelPromo.code);
      return;
    }
    if (prizeInCart) {
      removeItemsByPromoCode(wheelPromo.code);
      return;
    }
    resolveAndRedeem(wheelPromo);
  };

  const handlePointsRedeemed = async (code: string, pointsSpent: number) => {
    if (!userId) return;
    queryClient.setQueryData(['profile', userId], (old: any) =>
      old ? { ...old, panino_points: (old.panino_points ?? 0) - pointsSpent } : old
    );
    queryClient.invalidateQueries({ queryKey: ['profile', userId] });
    const { data: promo, error } = await (supabase as any)
      .from('promotions')
      .select('*')
      .eq('code', code)
      .eq('user_id', userId)
      .single();
    if (error || !promo) return;
    resolveAndRedeem(promo);
  };

  // Spending points can't be undone, so it asks first.
  const [redeemingTier, setRedeemingTier] = useState<string | null>(null);
  const handleRedeemTier = (tier: (typeof REWARD_TIERS)[number]) => {
    Alert.alert(`Get a ${tier.title}?`, `This uses ${tier.cost.toLocaleString()} of your PaninoPoints.`, [
      { text: 'Not Now', style: 'cancel' },
      {
        text: 'Redeem',
        onPress: async () => {
          setRedeemingTier(tier.tier);
          try {
            const { data, error } = await (supabase as any).rpc('redeem_points_reward', { p_tier: tier.tier });
            if (error) throw error;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            await handlePointsRedeemed(data.code, data.pointsSpent);
          } catch (e: any) {
            Alert.alert("Couldn't Redeem", e.message);
          } finally {
            setRedeemingTier(null);
          }
        },
      },
    ]);
  };

  // An account that never set a password (a guest who verified their email
  // at checkout) couldn't sign back in afterward, so it's offered the
  // chance to set one first -- same as the More tab.
  const handleSignOut = () => {
    if (needsPassword(session?.user)) {
      Alert.alert(
        "You Haven't Set a Password",
        "Without one you won't be able to sign back in to this account and its orders and points. Set a password first?",
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign Out Anyway', style: 'destructive', onPress: () => signOutToLogin(router) },
          { text: 'Set a Password', onPress: () => setSetupVisible(true) },
        ]
      );
      return;
    }
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOutToLogin(router) },
    ]);
  };

  // Never "null null": fall back to the email when there's no name yet.
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');
  const initials = (
    fullName
      ? `${profile?.first_name?.[0] ?? ''}${profile?.last_name?.[0] ?? ''}`
      : session?.user?.email?.[0] ?? '?'
  ).toUpperCase();
  const showFinishAccount = needsPassword(session?.user);
  const since = memberSince(session?.user?.created_at);

  const points = profile?.panino_points ?? 0;
  const nextTier = REWARD_TIERS.find((t) => t.cost > points);
  const trackFill = Math.min(points / TOP_TIER, 1);
  const pointsLine = nextTier
    ? `${(nextTier.cost - points).toLocaleString()} more points for a ${nextTier.short.toLowerCase()}`
    : 'Every reward unlocked -- treat yourself!';

  const phoneLabel = profile?.phone
    ? (() => {
        const { country, digits } = parsePhone(profile.phone);
        return `+${country.dialCode} ${formatPhoneNumber(digits, country)}`;
      })()
    : 'Add your phone number';

  // Guests see the Profile tab too (so the tab bar doesn't change shape the
  // moment a guest becomes a member) -- as an invitation to join.
  if (isAnonymous) {
    return (
      <View className="flex-1 bg-[#FAF6F0] pt-14 px-4">
        <Text className="text-2xl font-display-bold text-[#1C1917] tracking-tight mb-3">Profile</Text>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: cartBarSpace + 24 }}>
          <GuestJoinCard
            onCreate={() => setSetupVisible(true)}
            onSignIn={() => confirmSwitchToExistingAccount(router)}
          />
        </ScrollView>
        <AccountSetupSheet
          visible={setupVisible}
          mode="upgrade"
          onClose={() => setSetupVisible(false)}
          onDone={() => {
            setSetupVisible(false);
            welcomeNewAccount(router);
          }}
        />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View className="flex-1 bg-[#FAF6F0] justify-center items-center">
        <ActivityIndicator size="large" color={RED} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#FAF6F0]">
      <ScrollView
        ref={scrollViewRef}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: cartBarSpace + 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header -- dark, so the red points card below stands out */}
        <View style={{ paddingTop: insets.top + 14, paddingBottom: 92, backgroundColor: INK }} className="px-5">
          <GradientFill id="profileHeader" x2={0.6} stops={[['0', '#2A0B08'], ['1', INK]]} />

          <Animated.View entering={FadeInDown.duration(450)} className="flex-row items-center">
            <View style={styles.avatarRing}>
              <View style={styles.avatar}>
                <Text className="text-2xl font-display-bold text-[#F4ECE1]">{initials}</Text>
              </View>
            </View>
            <View className="flex-1 ml-4 mr-2">
              <Text className="text-[26px] font-display-bold text-[#F4ECE1] tracking-tight" numberOfLines={1}>
                {fullName || 'Welcome!'}
              </Text>
              {!!since && <Text className="text-stone-400 text-xs font-inter-medium mt-0.5">{since}</Text>}
            </View>
            <TouchableOpacity
              onPress={() => router.push('/(main)/edit-profile')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              className="w-10 h-10 rounded-full bg-white/10 items-center justify-center border border-white/15"
            >
              <Ionicons name="pencil" size={16} color={CREAM} />
            </TouchableOpacity>
          </Animated.View>
        </View>

        <View className="px-4" style={{ marginTop: -72 }}>
          {/* PaninoPoints card */}
          <Animated.View entering={FadeInDown.duration(500).delay(80)} style={styles.pointsCardShadow}>
            <View style={styles.pointsCard}>
              <GradientFill
                id="pointsCard"
                x2={1}
                stops={[['0', '#D0261B'], ['0.55', RED], ['1', '#6E100B']]}
              />
              <Animated.View pointerEvents="none" style={[styles.shine, shineStyle]} />

              <View className="flex-row items-center justify-between">
                <Text style={styles.cardLabel}>PANINOPOINTS</Text>
                <View className="flex-row items-center bg-black/20 px-2.5 py-1 rounded-full">
                  <Ionicons name="star" size={11} color={GOLD} />
                  <Text className="text-[10px] font-inter-bold text-[#F4ECE1] ml-1 tracking-wider">MEMBER</Text>
                </View>
              </View>

              <View className="flex-row items-end mt-2">
                <PointsCounter value={points} playKey={playKey} />
                <Text className="text-[#F4ECE1] font-inter-bold text-base ml-1.5 mb-2.5 opacity-80">pts</Text>
              </View>
              <Text className="text-[#F4ECE1] text-xs font-inter-medium opacity-90 -mt-1">{pointsLine}</Text>

              {/* The track, with a stop at each reward */}
              <View className="mt-5 mb-1 mx-2">
                <View style={styles.track}>
                  <View style={[styles.trackFill, { width: `${trackFill * 100}%` }]} />
                </View>
                {REWARD_TIERS.map((t) => {
                  const reached = points >= t.cost;
                  return (
                    <View
                      key={t.tier}
                      style={[
                        styles.stop,
                        { left: `${(t.cost / TOP_TIER) * 100}%` },
                        reached ? styles.stopReached : null,
                      ]}
                    >
                      <Ionicons name={t.icon} size={11} color={reached ? RED_DARK : 'rgba(244,236,225,0.7)'} />
                    </View>
                  );
                })}
              </View>
              <View className="mt-3 mx-2" style={{ height: 14 }}>
                {REWARD_TIERS.map((t, i) => (
                  <Text
                    key={t.tier}
                    style={[
                      styles.stopLabel,
                      {
                        left: `${(t.cost / TOP_TIER) * 100}%`,
                        transform: [{ translateX: i === REWARD_TIERS.length - 1 ? -34 : -20 }],
                      },
                      points >= t.cost ? { color: GOLD } : null,
                    ]}
                  >
                    {t.cost.toLocaleString()}
                  </Text>
                ))}
              </View>
            </View>
          </Animated.View>

          {/* Rewards to spend points on */}
          <Animated.View entering={FadeInDown.duration(500).delay(160)} className="flex-row mt-3" style={{ gap: 8 }}>
            {REWARD_TIERS.map((t) => {
              const unlocked = points >= t.cost;
              const busy = redeemingTier === t.tier;
              return (
                <TouchableOpacity
                  key={t.tier}
                  disabled={!unlocked || redeemingTier !== null}
                  onPress={() => handleRedeemTier(t)}
                  activeOpacity={0.8}
                  className={`flex-1 rounded-2xl p-3 items-center border ${
                    unlocked ? 'bg-white border-[#A61C14]' : 'bg-white border-stone-200'
                  }`}
                >
                  <View
                    className={`w-11 h-11 rounded-full items-center justify-center mb-2 ${
                      unlocked ? 'bg-[#A61C14]' : 'bg-stone-100'
                    }`}
                  >
                    <Ionicons name={t.icon} size={20} color={unlocked ? GOLD : '#A8A29E'} />
                  </View>
                  <Text className="text-xs font-inter-bold text-[#1C1917] text-center" numberOfLines={1}>
                    {t.short}
                  </Text>
                  {busy ? (
                    <ActivityIndicator size="small" color={RED} style={{ marginTop: 6 }} />
                  ) : unlocked ? (
                    <View className="bg-[#A61C14] rounded-full px-3 py-1 mt-1.5">
                      <Text className="text-[10px] font-inter-extrabold text-[#F4ECE1] tracking-wider">REDEEM</Text>
                    </View>
                  ) : (
                    <Text className="text-[11px] text-[#78716C] font-inter-semibold mt-1.5">
                      {(t.cost - points).toLocaleString()} to go
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </Animated.View>

          {/* A guest who verified their email at checkout stops being a
              guest but has no password, so they couldn't sign back in after
              signing out (see lib/account.ts). */}
          {showFinishAccount && (
            <Animated.View
              entering={FadeInDown.duration(500).delay(220)}
              className="bg-white rounded-3xl border border-[#A61C14] shadow-sm p-5 mt-4"
            >
              <View className="flex-row items-center mb-1">
                <Ionicons name="key-outline" size={15} color={RED} />
                <Text className="text-[11px] font-inter-bold text-[#A61C14] uppercase tracking-wider ml-1.5">
                  Finish Your Account
                </Text>
              </View>
              <Text className="text-[#1C1917] text-sm mb-3">
                Add your name, phone and a password so you can sign back in anytime and keep your orders and points.
              </Text>
              <TouchableOpacity
                onPress={() => setSetupVisible(true)}
                className="bg-[#A61C14] py-3 rounded-xl items-center active:bg-[#85140E]"
              >
                <Text className="text-[#F4ECE1] font-inter-bold text-sm">Set Up My Account</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* The wheel prize, as a ticket */}
          {profile?.wheel_prize_code && wheelPromo && (
            <Animated.View entering={FadeInDown.duration(500).delay(240)} style={styles.ticket}>
              <View style={styles.ticketImageWrap}>
                {prizeImage ? (
                  <Image source={{ uri: prizeImage }} style={styles.ticketImage} resizeMode="cover" />
                ) : (
                  <Ionicons name="trophy" size={34} color={GOLD} />
                )}
              </View>
              <View style={styles.ticketTear}>
                {Array.from({ length: 9 }).map((_, i) => (
                  <View key={i} style={styles.ticketDash} />
                ))}
              </View>
              <View className="flex-1 py-3.5 pr-4 pl-3.5 justify-center">
                <Text className="text-[10px] font-inter-extrabold text-[#FFC72C] tracking-widest mb-0.5">
                  YOUR WHEEL PRIZE
                </Text>
                <Text className="text-[15px] font-display-bold text-[#F4ECE1] mb-2.5" numberOfLines={2}>
                  {profile.wheel_prize_title}
                </Text>
                {isPickAnItemPrize(wheelPromo) ? (
                  <TouchableOpacity
                    onPress={handlePressPrize}
                    disabled={resolvingPrize}
                    activeOpacity={0.85}
                    className={`flex-row items-center justify-center rounded-full px-4 py-2 self-start ${
                      prizeInCart ? 'border border-[#FFC72C]' : 'bg-[#FFC72C]'
                    }`}
                  >
                    {resolvingPrize ? (
                      <ActivityIndicator size="small" color={prizeInCart ? GOLD : RED_DARK} />
                    ) : prizeInCart ? (
                      <>
                        <Ionicons name="checkmark-circle" size={14} color={GOLD} style={{ marginRight: 5 }} />
                        <Text className="text-[#FFC72C] font-inter-bold text-xs">In Your Cart -- Tap to Remove</Text>
                      </>
                    ) : (
                      <Text className="text-[#7A0E0A] font-inter-extrabold text-xs tracking-wide">REDEEM NOW</Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <>
                    <TouchableOpacity
                      onPress={() => handleCopyCode(profile.wheel_prize_code!)}
                      className="flex-row items-center border border-dashed border-[#FFC72C] rounded-lg px-3 py-1.5 self-start"
                    >
                      <Text className="text-[#FFC72C] font-inter-extrabold tracking-widest text-xs mr-2">
                        {profile.wheel_prize_code}
                      </Text>
                      <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={14} color={GOLD} />
                    </TouchableOpacity>
                    <Text className="text-stone-400 text-[11px] mt-1.5">
                      {copied ? 'Copied!' : "Tap to copy -- it's also in your cart's deals list."}
                    </Text>
                  </>
                )}
              </View>
            </Animated.View>
          )}

          {/* Orders and the usual */}
          <Animated.View entering={FadeInDown.duration(500).delay(300)} className="flex-row mt-4" style={{ gap: 10 }}>
            <TouchableOpacity
              onPress={() => router.push('/(main)/orders')}
              activeOpacity={0.8}
              className="flex-1 bg-white rounded-2xl border border-stone-200 shadow-sm p-4"
            >
              <View className="flex-row items-center justify-between mb-2">
                <Ionicons name="receipt" size={18} color={RED} />
                <Ionicons name="chevron-forward" size={15} color="#A8A29E" />
              </View>
              <Text className="text-2xl font-display-bold text-[#1C1917]">{orderCount ?? '—'}</Text>
              <Text className="text-[#78716C] text-xs font-inter-medium">
                {orderCount === 1 ? 'Order placed' : 'Orders placed'}
              </Text>
            </TouchableOpacity>

            <View className="flex-1 bg-white rounded-2xl border border-stone-200 shadow-sm p-4">
              <View className="flex-row items-center mb-2">
                {usualItem?.image_url ? (
                  <Image source={{ uri: usualItem.image_url }} className="w-7 h-7 rounded-lg bg-stone-100" />
                ) : (
                  <Ionicons name="heart" size={18} color={RED} />
                )}
              </View>
              <Text className="text-[15px] font-inter-extrabold text-[#1C1917]" numberOfLines={2}>
                {usualItem?.name ?? 'Not yet'}
              </Text>
              <Text className="text-[#78716C] text-xs font-inter-medium mt-0.5">
                {usualItem ? 'Your usual' : 'Your go-to shows here'}
              </Text>
            </View>
          </Animated.View>

          {/* Account */}
          <Animated.View entering={FadeInDown.duration(500).delay(360)}>
            <Text className="text-xs font-inter-bold uppercase tracking-wider text-stone-500 mt-6 mb-2 px-1">
              Account
            </Text>
            <View className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
              <AccountRow
                icon="person-outline"
                label="Personal Details"
                detail={[fullName, session?.user?.email].filter(Boolean).join(' · ')}
                onPress={() => router.push('/(main)/edit-profile')}
              />
              <AccountRow
                icon="call-outline"
                label="Phone"
                detail={phoneLabel}
                onPress={() => router.push('/(main)/edit-profile')}
              />
              <AccountRow
                icon="location-outline"
                label="Delivery Address"
                detail={profile?.address || 'Add an address'}
                onPress={() => router.push('/(main)/edit-profile')}
              />
              <AccountRow
                icon="time-outline"
                label="Order History"
                onPress={() => router.push('/(main)/orders')}
                last
              />
            </View>

            <Text className="text-xs font-inter-bold uppercase tracking-wider text-stone-500 mt-6 mb-2 px-1">
              More
            </Text>
            <View className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
              <AccountRow
                icon="notifications-outline"
                label="Settings"
                detail="Notifications and preferences"
                onPress={() => router.push('/(main)/settings')}
              />
              <AccountRow
                icon="help-buoy-outline"
                label="Customer Support"
                onPress={() => router.push('/(main)/customer-support')}
                last
              />
            </View>

            <TouchableOpacity
              onPress={handleSignOut}
              activeOpacity={0.7}
              className="flex-row items-center justify-center py-4 mt-4 mb-4"
            >
              <Ionicons name="log-out-outline" size={17} color={RED} />
              <Text className="text-[#A61C14] font-inter-bold text-sm ml-1.5">Sign Out</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </ScrollView>

      <AccountSetupSheet
        visible={setupVisible}
        mode="finish"
        initialValues={{ firstName: profile?.first_name, lastName: profile?.last_name, phone: profile?.phone }}
        onClose={() => setSetupVisible(false)}
        onDone={() => {
          setSetupVisible(false);
          if (profile && !profile.has_spun_wheel) {
            Alert.alert("You're All Set!", 'Your account is ready -- and your welcome spin is waiting.', [
              { text: 'Later', style: 'cancel' },
              { text: 'Spin the Wheel', onPress: () => router.replace('/(main)/spin-wheel') },
            ]);
          } else {
            Alert.alert("You're All Set!", 'You can now sign in anytime with your email and password.');
          }
        }}
      />

      {picker && (
        <PrizeItemPicker
          title={picker.promo.title}
          items={picker.items}
          onSelect={(selected) => {
            giveFreeItem(selected, picker.promo);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatarRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2.5,
    borderColor: GOLD,
    padding: 3,
  },
  avatar: {
    flex: 1,
    borderRadius: 30,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The shadow sits on an outer layer: on iOS a view that clips its
  // corners (overflow: hidden) also clips its own shadow.
  pointsCardShadow: {
    borderRadius: 24,
    backgroundColor: RED,
    shadowColor: '#6E100B',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
  },
  pointsCard: {
    borderRadius: 24,
    overflow: 'hidden',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
  },
  shine: {
    position: 'absolute',
    top: -20,
    bottom: -20,
    width: 70,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  cardLabel: {
    color: GOLD,
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 12,
    letterSpacing: 3,
  },
  pointsNumber: {
    color: CREAM,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 52,
    lineHeight: 60,
    letterSpacing: -1.5,
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.25)',
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: GOLD,
  },
  stop: {
    position: 'absolute',
    top: -8,
    width: 24,
    height: 24,
    marginLeft: -12,
    borderRadius: 12,
    backgroundColor: '#7A0E0A',
    borderWidth: 2,
    borderColor: 'rgba(244,236,225,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopReached: {
    backgroundColor: GOLD,
    borderColor: '#FFE58A',
  },
  stopLabel: {
    position: 'absolute',
    width: 40,
    textAlign: 'center',
    color: 'rgba(244,236,225,0.75)',
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
  },
  ticket: {
    flexDirection: 'row',
    backgroundColor: INK,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255,199,44,0.6)',
    marginTop: 16,
    overflow: 'hidden',
  },
  ticketImageWrap: {
    width: 104,
    alignSelf: 'stretch',
    minHeight: 112,
    backgroundColor: '#2A0B08',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Pinned to the photo box rather than sized by the photo -- a full-size
  // photo would otherwise stretch the whole ticket to its own height.
  ticketImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // Drawn as separate dashes: a dashed single-side border doesn't render
  // reliably on Android.
  ticketTear: {
    width: 2,
    alignSelf: 'stretch',
    paddingVertical: 6,
    justifyContent: 'space-between',
  },
  ticketDash: {
    width: 2,
    height: 6,
    borderRadius: 1,
    backgroundColor: 'rgba(255,199,44,0.6)',
  },
});
