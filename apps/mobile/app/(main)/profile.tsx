import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useLocationStore } from '../../store/locationStore';
import { useQuery } from '@tanstack/react-query';

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
  const { data: wheelPromoActive } = useQuery({
    queryKey: ['wheelPromoActive', session?.user?.id, profile?.wheel_prize_code],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('promotions')
        .select('id')
        .eq('code', profile!.wheel_prize_code)
        .eq('user_id', session!.user.id)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
    enabled: !isAnonymous && !!session?.user?.id && !!profile?.wheel_prize_code,
  });

  const [copied, setCopied] = useState(false);
  const handleCopyCode = async (code: string) => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
    <ScrollView className="flex-1 bg-[#FAF6F0]" showsVerticalScrollIndicator={false}>
      {/* Hero */}
      <View className="bg-[#A61C14] pt-16 pb-8 px-6 items-center rounded-b-[32px]">
        <View className="w-24 h-24 rounded-full bg-[#F4ECE1] items-center justify-center mb-4 border-4 border-[#85140E]">
          <Text className="text-3xl font-extrabold text-[#A61C14]">{initials}</Text>
        </View>
        <Text className="text-2xl font-extrabold text-[#F4ECE1]">
          {profile ? `${profile.first_name} ${profile.last_name}` : 'Welcome back'}
        </Text>
        <Text className="text-[#F4ECE1] opacity-80 mt-1">{session?.user?.email}</Text>
        <TouchableOpacity
          onPress={() => router.push('/(main)/edit-profile')}
          className="flex-row items-center bg-[#85140E] px-4 py-2 rounded-full mt-4"
        >
          <Ionicons name="pencil" size={14} color="#F4ECE1" />
          <Text className="text-[#F4ECE1] font-bold text-sm ml-2">Edit Profile</Text>
        </TouchableOpacity>
      </View>

      <View className="px-4 -mt-6">
        {/* Welcome wheel prize, if they won a redeemable code (see
            (main)/spin-wheel.tsx) -- points-only wins show up in the stat
            tile below instead, since there's no code to redeem. */}
        {profile?.wheel_prize_code && wheelPromoActive && (
          <View className="bg-white rounded-2xl border border-[#A61C14] shadow-sm p-5 mb-4">
            <Text className="text-xs font-bold text-[#A61C14] uppercase tracking-wider mb-1">
              Your Welcome Prize
            </Text>
            <Text className="text-lg font-extrabold text-[#1C1917] mb-2">{profile.wheel_prize_title}</Text>
            <TouchableOpacity
              onPress={() => handleCopyCode(profile.wheel_prize_code!)}
              className="flex-row items-center bg-[#FAF6F0] border border-dashed border-[#A61C14] rounded-lg px-4 py-2 self-start"
            >
              <Text className="text-[#A61C14] font-extrabold tracking-widest mr-2">{profile.wheel_prize_code}</Text>
              <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color="#A61C14" />
            </TouchableOpacity>
            <Text className="text-[#78716C] text-sm mt-2">
              {copied ? 'Copied!' : 'Tap the code to copy it, then enter it in the Cart to redeem it.'}
            </Text>
          </View>
        )}

        {!!profile?.panino_points && (
          <View className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 flex-row items-center mb-4">
            <View className="w-12 h-12 rounded-full bg-[#FAF6F0] items-center justify-center mr-4">
              <Ionicons name="star" size={22} color="#A61C14" />
            </View>
            <View className="flex-1">
              <Text className="text-2xl font-extrabold text-[#1C1917]">{profile.panino_points}</Text>
              <Text className="text-[#78716C] text-sm">PaninoPoints</Text>
            </View>
          </View>
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
            <Text className="text-2xl font-extrabold text-[#1C1917]">{orderCount ?? '—'}</Text>
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
                <Text className="text-xs text-[#78716C] uppercase font-bold tracking-wider">Phone</Text>
                <Text className="text-base font-semibold text-[#1C1917]">{profile.phone}</Text>
              </View>
            </View>
            <View className="flex-row items-center p-4">
              <Ionicons name="location-outline" size={20} color="#A61C14" style={{ width: 28 }} />
              <View>
                <Text className="text-xs text-[#78716C] uppercase font-bold tracking-wider">Address</Text>
                <Text className="text-base font-semibold text-[#1C1917]">{profile.address}</Text>
              </View>
            </View>
          </View>
        )}

        <TouchableOpacity
          onPress={handleSignOut}
          className="bg-red-50 p-4 rounded-2xl w-full items-center border border-red-200 mb-8 active:bg-red-100"
        >
          <Text className="text-[#A61C14] font-bold text-lg">Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
