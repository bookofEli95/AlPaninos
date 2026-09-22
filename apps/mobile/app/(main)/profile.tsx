import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useLocationStore } from '../../store/locationStore';
import { useCartStore } from '../../store/cartStore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PointsRewards from '../../components/PointsRewards';
import PrizeItemPicker from '../../components/PrizeItemPicker';
import { EligiblePrizeItem, fetchEligiblePrizeItems, isPickAnItemPrize, itemHasModifiers } from '../../lib/prizeRedemption';
import { formatPhoneNumber, parsePhone } from '../../lib/countries';

type ProfileData = {
  first_name: string;
  last_name: string;
  phone: string;
  address: string;
  panino_points: number | null;
  wheel_prize_title: string | null;
  wheel_prize_code: string | null;
};

export default function ProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, setSession } = useAuthStore();
  const locationId = useLocationStore(state => state.locationId);
  const isAnonymous = session?.user?.is_anonymous ?? false;

  // Profile is hidden from guests' tab bar, but the route itself is still
  // reachable (e.g. the Android back gesture can land here regardless) --
  // there's nothing here for a guest, so bounce them out immediately. The
  // redirect below only fires *after* the first render, so without this
  // early return a guest would see a flash of an empty profile card first
  // (no profile row worth showing, is_anonymous just hasn't been acted on
  // yet) -- bailing out of the render entirely avoids that.
  useEffect(() => {
    if (isAnonymous) {
      router.replace(locationId ? `/(main)/menu/${locationId}` : '/(main)');
    }
  }, [isAnonymous]);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) return null;
      const { data, error } = await (supabase as any)
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      if (error) throw error;
      return data as ProfileData;
    },
    enabled: !isAnonymous && !!session?.user?.id
  });

  // profiles.wheel_prize_code stays set forever as a record of what was
  // won -- this checks whether that code is still actually redeemable
  // (mark_promo_used flips it inactive at checkout), so the banner below
  // disappears once it's been used instead of showing a dead code forever.
  // Fetching the full row (not just whether it exists) lets the banner
  // decide whether this is a "pick a specific item" prize.
  const { data: wheelPromo } = useQuery({
    queryKey: ['wheelPromo', session?.user?.id, profile?.wheel_prize_code],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('promotions')
        .select('*')
        .eq('code', profile!.wheel_prize_code)
        .eq('user_id', session!.user.id)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !isAnonymous && !!session?.user?.id && !!profile?.wheel_prize_code,
  });

  // Profile is a hidden tab (href: null) that stays mounted once visited
  // rather than unmounting on tab switch, so react-query's normal
  // mount/window-focus refetch triggers don't fire just from navigating
  // back here -- re-checking on every focus is what actually catches a
  // promo/points balance that changed elsewhere (checkout already
  // invalidates these keys too, but this covers it even if that path is
  // ever missed).
  useFocusEffect(
    useCallback(() => {
      if (!session?.user?.id) return;
      queryClient.invalidateQueries({ queryKey: ['profile', session.user.id] });
      queryClient.invalidateQueries({ queryKey: ['wheelPromo', session.user.id] });
    }, [session?.user?.id])
  );

  // Profile stays mounted once visited (see the useFocusEffect above), so
  // without this a scroll position from a previous visit would still be
  // sitting there the next time this tab is switched back into -- always
  // start at the top on focus instead.
  const scrollViewRef = useRef<ScrollView>(null);
  useFocusEffect(
    useCallback(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    }, [])
  );

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

  // Nothing is marked "applied" here directly -- a reward only counts as
  // applied once its tagged item actually exists in the cart (addFreeItem,
  // or item/[id].tsx's Add to Cart for one with modifiers), so backing out
  // of the modifier-picking flow before finishing leaves nothing applied.
  const giveFreeItem = (target: EligiblePrizeItem, promo: any) => {
    itemHasModifiers(target.id).then((hasModifiers) => {
      if (hasModifiers) {
        router.push({
          pathname: `/(main)/item/${target.id}`,
          params: { promoCode: promo.code, promoTitle: promo.title },
        });
      } else if (locationId) {
        addFreeItem({ menuItemId: target.id, name: target.name, basePrice: target.base_price }, locationId, promo.code);
        Alert.alert('Added!', `${target.name} was added to your cart -- it's free.`);
      }
    });
  };

  // Shared by the wheel-prize banner and PaninoPoints redemption below --
  // both land in promotions the same way (see the panino_points migration),
  // so both resolve the same way: single eligible item -> straight to the
  // cart, several -> a picker, none -> saved but unavailable here.
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

  // Cart items are shared across Deals/Cart/Profile (useCartStore) -- if
  // this exact prize's item is already sitting in the cart (redeemed from
  // Deals, or from here), tapping it again must not run the whole
  // picker/add-to-cart flow a second time (a duplicate free item, or a
  // stray picker popping up). Toggling it off mirrors exactly what Deals'
  // own card already does.
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

  // Points rewards are always "pick a specific item" promos (100% off a
  // category -- see isPickAnItemPrize), so there's no raw-code path to
  // branch to here the way the wheel banner has.
  const handlePointsRedeemed = async (code: string, pointsSpent: number) => {
    if (!session?.user?.id) return;
    // Decrement the cached balance synchronously so the points number and
    // every reward tier's progress bar (not just the one just redeemed)
    // update the instant this resolves, instead of waiting on the refetch
    // that invalidateQueries below only schedules.
    queryClient.setQueryData(['profile', session.user.id], (old: any) =>
      old ? { ...old, panino_points: (old.panino_points ?? 0) - pointsSpent } : old
    );
    queryClient.invalidateQueries({ queryKey: ['profile', session.user.id] });
    const { data: promo, error } = await (supabase as any)
      .from('promotions')
      .select('*')
      .eq('code', code)
      .eq('user_id', session.user.id)
      .single();
    if (error || !promo) return;
    resolveAndRedeem(promo);
  };

  const { data: orderCount } = useQuery({
    queryKey: ['orderCount', session?.user?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', session!.user.id);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !isAnonymous && !!session?.user?.id
  });

  const handleSignOut = async () => {
    await supabase.auth.signOut().catch(console.warn);
    setSession(null);
    router.replace('/(auth)/login');
  };

  const initials = profile
    ? `${profile.first_name?.[0] ?? ''}${profile.last_name?.[0] ?? ''}`.toUpperCase()
    : (session?.user?.email?.[0] ?? '?').toUpperCase();

  if (isAnonymous || isLoading) {
    return (
      <View className="flex-1 bg-[#FAF6F0] justify-center items-center">
        <ActivityIndicator size="large" color="#A61C14" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#FAF6F0]">
      <ScrollView ref={scrollViewRef} className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View className="bg-[#A61C14] pt-16 pb-8 px-6 items-center rounded-b-[32px]">
          <View className="w-24 h-24 rounded-full bg-[#F4ECE1] items-center justify-center mb-4 border-4 border-[#85140E]">
            <Text className="text-3xl font-inter-extrabold text-[#A61C14]">{initials}</Text>
          </View>
          <Text className="text-2xl font-display-bold text-[#F4ECE1]">
            {profile ? `${profile.first_name} ${profile.last_name}` : 'Welcome back'}
          </Text>
          <Text className="text-[#F4ECE1] opacity-80 mt-1">{session?.user?.email}</Text>
          <TouchableOpacity
            onPress={() => router.push('/(main)/edit-profile')}
            className="flex-row items-center bg-[#85140E] px-4 py-2 rounded-full mt-4"
          >
            <Ionicons name="pencil" size={14} color="#F4ECE1" />
            <Text className="text-[#F4ECE1] font-inter-bold text-sm ml-2">Edit Profile</Text>
          </TouchableOpacity>
        </View>

        <View className="px-4 -mt-6">
          {/* Welcome wheel prize, if they won a redeemable code (see
              (main)/spin-wheel.tsx) -- points-only wins show up in the stat
              tile below instead, since there's no code to redeem. */}
          {profile?.wheel_prize_code && wheelPromo && (
            <View className="bg-white rounded-2xl border border-[#A61C14] shadow-sm p-5 mb-4">
              <Text className="text-xs font-inter-bold text-[#A61C14] uppercase tracking-wider mb-1">
                Your Welcome Prize
              </Text>
              <Text className="text-lg font-inter-extrabold text-[#1C1917] mb-2">{profile.wheel_prize_title}</Text>
              {isPickAnItemPrize(wheelPromo) ? (
                <TouchableOpacity
                  onPress={handlePressPrize}
                  disabled={resolvingPrize}
                  className={`flex-row items-center justify-center rounded-lg px-4 py-3 ${
                    prizeInCart
                      ? 'bg-[#FAF6F0] border border-[#A61C14]'
                      : 'bg-[#A61C14] active:bg-[#85140E]'
                  }`}
                >
                  {resolvingPrize ? (
                    <ActivityIndicator size="small" color={prizeInCart ? '#A61C14' : '#F4ECE1'} />
                  ) : prizeInCart ? (
                    <>
                      <Ionicons name="checkmark-circle" size={16} color="#A61C14" style={{ marginRight: 6 }} />
                      <Text className="text-[#A61C14] font-inter-extrabold">Applied -- Tap to Remove</Text>
                    </>
                  ) : (
                    <Text className="text-[#F4ECE1] font-inter-extrabold">Redeem Now</Text>
                  )}
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity
                    onPress={() => handleCopyCode(profile.wheel_prize_code!)}
                    className="flex-row items-center bg-[#FAF6F0] border border-dashed border-[#A61C14] rounded-lg px-4 py-2 self-start"
                  >
                    <Text className="text-[#A61C14] font-inter-extrabold tracking-widest mr-2">{profile.wheel_prize_code}</Text>
                    <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color="#A61C14" />
                  </TouchableOpacity>
                  <Text className="text-[#78716C] text-sm mt-2">
                    {copied ? 'Copied!' : 'Tap the code to copy it, then enter it in the Cart to redeem it.'}
                  </Text>
                </>
              )}
            </View>
          )}

          {session?.user?.id && (
            <PointsRewards
              points={profile?.panino_points ?? 0}
              onRedeemed={handlePointsRedeemed}
            />
          )}

          {/* Orders stat */}
          <TouchableOpacity
            onPress={() => router.push('/(main)/orders')}
            className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 flex-row items-center mb-4"
          >
            <View className="w-12 h-12 rounded-full bg-[#FAF6F0] items-center justify-center mr-4">
              <Ionicons name="receipt" size={22} color="#A61C14" />
            </View>
            <View className="flex-1">
              <Text className="text-2xl font-inter-extrabold text-[#1C1917]">{orderCount ?? '—'}</Text>
              <Text className="text-[#78716C] text-sm">Orders placed</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#A8A29E" />
          </TouchableOpacity>

          {/* Contact info */}
          {profile && (
            <View className="bg-white rounded-2xl border border-stone-200 shadow-sm mb-6 overflow-hidden">
              <View className="flex-row items-center p-4 border-b border-stone-100">
                <Ionicons name="call-outline" size={20} color="#A61C14" style={{ width: 28 }} />
                <View>
                  <Text className="text-xs text-[#78716C] uppercase font-inter-bold tracking-wider">Phone</Text>
                  <Text className="text-base font-inter-semibold text-[#1C1917]">
                    {(() => {
                      const { country, digits } = parsePhone(profile.phone || '');
                      return `+${country.dialCode} ${formatPhoneNumber(digits, country)}`;
                    })()}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center p-4">
                <Ionicons name="location-outline" size={20} color="#A61C14" style={{ width: 28 }} />
                <View>
                  <Text className="text-xs text-[#78716C] uppercase font-inter-bold tracking-wider">Address</Text>
                  <Text className="text-base font-inter-semibold text-[#1C1917]">{profile.address}</Text>
                </View>
              </View>
            </View>
          )}

          <TouchableOpacity
            onPress={handleSignOut}
            className="bg-red-50 p-4 rounded-2xl w-full items-center border border-red-200 mb-8 active:bg-red-100"
          >
            <Text className="text-[#A61C14] font-display text-lg">Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

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
