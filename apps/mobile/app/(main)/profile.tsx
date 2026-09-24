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
import AccountSetupSheet from '../../components/AccountSetupSheet';

type ProfileData = {
  first_name: string;
  last_name: string;
  phone: string;
  address: string;
  panino_points: number | null;
  wheel_prize_title: string | null;
  wheel_prize_code: string | null;
  has_spun_wheel: boolean;
};

export default function ProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, setSession } = useAuthStore();
  const locationId = useLocationStore(state => state.locationId);
  const isAnonymous = session?.user?.is_anonymous ?? false;
  const [setupVisible, setSetupVisible] = useState(false);

  useEffect(() => {
    if (isAnonymous) {
      router.replace(locationId ? `/(main)/menu/${locationId}` : '/(main)');
    }
  }, [isAnonymous, locationId, router]);

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

  useFocusEffect(
    useCallback(() => {
      if (!session?.user?.id) return;
      queryClient.invalidateQueries({ queryKey: ['profile', session.user.id] });
      queryClient.invalidateQueries({ queryKey: ['wheelPromo', session.user.id] });
      // Checkout doesn't invalidate orderCount, so without this the count
      // stays stale after placing a new order.
      queryClient.invalidateQueries({ queryKey: ['orderCount', session.user.id] });
    }, [session?.user?.id, queryClient])
  );

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
    if (!session?.user?.id) return;
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

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut().catch(console.warn);
          setSession(null);
          router.replace('/(auth)/login');
        },
      },
    ]);
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
          <View className="w-[88px] h-[88px] rounded-full bg-[#F4ECE1] items-center justify-center mb-3 border-4 border-[#85140E]">
            <Text className="text-2xl font-inter-extrabold text-[#A61C14]">{initials}</Text>
          </View>
          <Text className="text-2xl font-display-bold text-[#F4ECE1] tracking-tight">
            {profile ? `${profile.first_name} ${profile.last_name}` : 'Welcome back'}
          </Text>
          <Text className="text-[#F4ECE1] opacity-80 text-xs mt-0.5">{session?.user?.email}</Text>
          <TouchableOpacity
            onPress={() => router.push('/(main)/edit-profile')}
            className="flex-row items-center bg-[#85140E] px-4 py-1.5 rounded-full mt-3.5 shadow-2xs"
          >
            <Ionicons name="pencil" size={13} color="#F4ECE1" />
            <Text className="text-[#F4ECE1] font-inter-bold text-xs ml-1.5">Edit Profile</Text>
          </TouchableOpacity>
        </View>

        <View className="px-4 -mt-4">
          {/* A guest who verified their email at checkout stops being a
              guest (Supabase links the email to their session) -- but has no
              name and no password, so they couldn't sign back in after
              signing out. Every account created through Sign Up has a first
              name from signup, so a missing one is how to spot these. */}
          {profile && !profile.first_name && (
            <View className="bg-white rounded-3xl border border-[#A61C14] shadow-sm p-5 mb-3">
              <View className="flex-row items-center mb-1">
                <Ionicons name="key-outline" size={15} color="#A61C14" />
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
            </View>
          )}

          {profile?.wheel_prize_code && wheelPromo && (
            <View className="bg-white rounded-2xl border border-[#A61C14] shadow-sm p-4 mb-3">
              <Text className="text-[11px] font-inter-bold text-[#A61C14] uppercase tracking-wider mb-1">
                Your Welcome Prize
              </Text>
              <Text className="text-base font-inter-extrabold text-[#1C1917] mb-2">{profile.wheel_prize_title}</Text>
              {isPickAnItemPrize(wheelPromo) ? (
                <TouchableOpacity
                  onPress={handlePressPrize}
                  disabled={resolvingPrize}
                  className={`flex-row items-center justify-center rounded-xl px-4 py-2.5 ${
                    prizeInCart
                      ? 'bg-[#FAF6F0] border border-[#A61C14]'
                      : 'bg-[#A61C14] active:bg-[#85140E]'
                  }`}
                >
                  {resolvingPrize ? (
                    <ActivityIndicator size="small" color={prizeInCart ? '#A61C14' : '#F4ECE1'} />
                  ) : prizeInCart ? (
                    <>
                      <Ionicons name="checkmark-circle" size={15} color="#A61C14" style={{ marginRight: 5 }} />
                      <Text className="text-[#A61C14] font-inter-bold text-xs">Applied -- Tap to Remove</Text>
                    </>
                  ) : (
                    <Text className="text-[#F4ECE1] font-inter-bold text-xs">Redeem Now</Text>
                  )}
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity
                    onPress={() => handleCopyCode(profile.wheel_prize_code!)}
                    className="flex-row items-center bg-[#FAF6F0] border border-dashed border-[#A61C14] rounded-lg px-3.5 py-1.5 self-start"
                  >
                    <Text className="text-[#A61C14] font-inter-extrabold tracking-widest text-xs mr-2">{profile.wheel_prize_code}</Text>
                    <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={15} color="#A61C14" />
                  </TouchableOpacity>
                  <Text className="text-[#78716C] text-xs mt-1.5">
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

          <TouchableOpacity
            onPress={() => router.push('/(main)/orders')}
            className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 flex-row items-center mb-3"
          >
            <View className="w-11 h-11 rounded-full bg-[#FAF6F0] items-center justify-center mr-3 border border-stone-200">
              <Ionicons name="receipt" size={20} color="#A61C14" />
            </View>
            <View className="flex-1">
              <Text className="text-xl font-inter-extrabold text-[#1C1917]">{orderCount ?? '—'}</Text>
              <Text className="text-[#78716C] text-xs">Orders placed</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#A8A29E" />
          </TouchableOpacity>

          {profile && (
            <View className="bg-white rounded-2xl border border-stone-200 shadow-sm mb-4 overflow-hidden">
              <View className="flex-row items-center p-3.5 border-b border-stone-100">
                <Ionicons name="call-outline" size={18} color="#A61C14" style={{ width: 26 }} />
                <View>
                  <Text className="text-[10px] text-[#78716C] uppercase font-inter-bold tracking-wider">Phone</Text>
                  <Text className="text-sm font-inter-semibold text-[#1C1917]">
                    {(() => {
                      const { country, digits } = parsePhone(profile.phone || '');
                      return `+${country.dialCode} ${formatPhoneNumber(digits, country)}`;
                    })()}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center p-3.5">
                <Ionicons name="location-outline" size={18} color="#A61C14" style={{ width: 26 }} />
                <View>
                  <Text className="text-[10px] text-[#78716C] uppercase font-inter-bold tracking-wider">Address</Text>
                  <Text className="text-sm font-inter-semibold text-[#1C1917]">{profile.address}</Text>
                </View>
              </View>
            </View>
          )}

          <TouchableOpacity
            onPress={handleSignOut}
            className="bg-red-50 p-3.5 rounded-2xl w-full items-center border border-red-200 mb-8 active:bg-red-100"
          >
            <Text className="text-[#A61C14] font-inter-bold text-sm">Sign Out</Text>
          </TouchableOpacity>
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