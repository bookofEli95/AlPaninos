import { useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, Linking, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { useCartStore } from '../../store/cartStore';
import { useLocations } from '../../hooks/useLocations';
import { isOpenNow, getTodayHoursLabel } from '../../lib/hours';
import AccountSetupSheet from '../../components/AccountSetupSheet';
import GuestJoinCard from '../../components/GuestJoinCard';
import { confirmSwitchToExistingAccount, signOutToLogin as signOutToLoginScreen, welcomeNewAccount } from '../../lib/guestSession';
import { useProfile } from '../../hooks/useProfile';
import { needsPassword } from '../../lib/account';

const MENU_ITEMS = [
  { label: 'Change Location', icon: 'location-outline', route: '/(main)' },
  { label: 'Settings', icon: 'settings-outline', route: '/(main)/settings' },
  { label: 'Customer Support', icon: 'help-buoy-outline', route: '/(main)/customer-support' },
  { label: 'Privacy Policy', icon: 'shield-checkmark-outline', route: '/(main)/privacy' },
  { label: 'Terms & Legal', icon: 'document-text-outline', route: '/(main)/legal' },
];

// A plain https link rather than the instagram:// scheme -- both iOS and
// Android hand instagram.com links to the Instagram app when it's installed
// (and open the browser when it isn't), with no extra app config needed.
const INSTAGRAM_URL = 'https://www.instagram.com/al_paninos/';

// Apple Maps on iOS, Google Maps everywhere else -- each phone's own default
// maps app, opened straight into directions to the store.
function openDirections(address: string) {
  const destination = encodeURIComponent(address);
  const url =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${destination}`
      : `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
  Linking.openURL(url).catch(() => Alert.alert("Couldn't open maps", 'Please try again.'));
}

export default function MoreScreen() {
  const router = useRouter();
  const { session } = useAuthStore();
  const isAnonymous = session?.user?.is_anonymous ?? false;
  const { data: locations } = useLocations();
  const hasCartItems = useCartStore((state) => state.items.length > 0);

  // A tab stays mounted, so it would otherwise reopen wherever it was left.
  const scrollRef = useRef<ScrollView>(null);
  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, [])
  );
  const [setupVisible, setSetupVisible] = useState(false);
  // 'upgrade' for a guest creating an account; 'finish' for an account that
  // still has no password (see lib/account.ts).
  const [setupMode, setSetupMode] = useState<'upgrade' | 'finish'>('upgrade');
  const { data: profile } = useProfile();

  const signOutToLogin = () => signOutToLoginScreen(router);

  // Signing out of an anonymous session is irreversible (there's no way to
  // log back into it), so it confirms first.
  const handleGuestSignOut = () => {
    Alert.alert(
      'End Guest Session?',
      "Signing out ends this guest session for good -- anything tied to it won't be viewable again afterward. Create an account above if you want to keep it.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: signOutToLogin },
      ]
    );
  };

  // For signed-in accounts. One that never set a password (a guest who
  // verified their email at checkout) couldn't sign back in afterward, so
  // it's offered the chance to set one first.
  const handleSignOut = () => {
    if (needsPassword(session?.user)) {
      Alert.alert(
        "You Haven't Set a Password",
        "Without one you won't be able to sign back in to this account and its orders and points. Set a password first?",
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign Out Anyway', style: 'destructive', onPress: signOutToLogin },
          {
            text: 'Set a Password',
            onPress: () => {
              setSetupMode('finish');
              setSetupVisible(true);
            },
          },
        ]
      );
      return;
    }
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOutToLogin },
    ]);
  };

  const handleAccountCreated = () => {
    setSetupVisible(false);
    welcomeNewAccount(router);
  };

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-14 px-4">
      <Text className="text-2xl font-display-bold text-[#1C1917] tracking-tight mb-3 mt-1 ml-1.5">More</Text>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: hasCartItems ? 96 : 32 }}
      >
        {isAnonymous && (
          <GuestJoinCard
            onCreate={() => {
              setSetupMode('upgrade');
              setSetupVisible(true);
            }}
            onSignIn={() => confirmSwitchToExistingAccount(router)}
          />
        )}

        {!!locations?.length && (
          <>
            <Text className="text-xs font-inter-bold uppercase tracking-wider text-stone-500 mb-2 px-1">
              Store Locations
            </Text>
            {locations.map((location: any) => {
              const open = isOpenNow(location.hours);
              const hoursLabel = getTodayHoursLabel(location.hours);

              return (
                <View key={location.id} className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 mb-3">
                  <Text className="text-base font-inter-bold text-[#1C1917]">{location.name}</Text>
                  {!!location.address && <Text className="text-stone-500 text-xs mt-0.5">{location.address}</Text>}

                  <View className="flex-row items-center justify-between mt-3 pt-2.5 border-t border-stone-100">
                    <View className="flex-row items-center flex-1 mr-2">
                      <View className={`w-2 h-2 rounded-full mr-1.5 ${open ? 'bg-emerald-500' : 'bg-stone-300'}`} />
                      <Text
                        className={`text-xs font-inter-semibold ${open ? 'text-emerald-700' : 'text-stone-500'}`}
                        numberOfLines={1}
                      >
                        {open ? 'Open now' : 'Closed'}
                        {hoursLabel ? ` • Today ${hoursLabel}` : ''}
                      </Text>
                    </View>

                    {!!location.address && (
                      <TouchableOpacity
                        onPress={() => openDirections(location.address)}
                        className="flex-row items-center bg-[#FAF6F0] border border-stone-200 px-3 py-1.5 rounded-full active:bg-stone-100"
                      >
                        <Ionicons name="navigate-outline" size={13} color="#A61C14" />
                        <Text className="text-[#A61C14] font-inter-bold text-xs ml-1">Directions</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
            <View className="h-1" />
          </>
        )}

        <TouchableOpacity
          onPress={() =>
            Linking.openURL(INSTAGRAM_URL).catch(() => Alert.alert("Couldn't open Instagram", 'Please try again.'))
          }
          className="bg-white rounded-2xl border border-stone-200 shadow-sm p-3.5 flex-row items-center mb-3 active:bg-stone-50"
        >
          <View className="w-10 h-10 rounded-2xl bg-[#FAF6F0] border border-stone-200 items-center justify-center mr-3">
            <Ionicons name="logo-instagram" size={20} color="#A61C14" />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-inter-bold text-[#1C1917]">Follow on Instagram</Text>
            <Text className="text-xs text-stone-500">@al_paninos</Text>
          </View>
          <Ionicons name="open-outline" size={16} color="#A8A29E" />
        </TouchableOpacity>

        <View className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden mb-3">
          {MENU_ITEMS.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              onPress={() => router.push(item.route as any)}
              className={`flex-row items-center justify-between p-3.5 ${
                index < MENU_ITEMS.length - 1 ? 'border-b border-stone-100' : ''
              }`}
            >
              <View className="flex-row items-center">
                <Ionicons name={item.icon as any} size={18} color="#A61C14" style={{ width: 26 }} />
                <Text className="text-sm font-inter-semibold text-[#1C1917]">{item.label}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#A8A29E" />
            </TouchableOpacity>
          ))}
        </View>

        {isAnonymous && (
          <TouchableOpacity
            onPress={handleGuestSignOut}
            className="bg-red-50 p-3 rounded-2xl w-full items-center border border-red-200 mt-2 active:bg-red-100"
          >
            <Text className="text-[#A61C14] font-inter-bold text-xs">End Current Guest Session</Text>
          </TouchableOpacity>
        )}

        {!!session && !isAnonymous && (
          <TouchableOpacity
            onPress={handleSignOut}
            className="flex-row bg-red-50 p-3.5 rounded-2xl w-full items-center justify-center border border-red-200 mt-2 active:bg-red-100"
          >
            <Ionicons name="log-out-outline" size={16} color="#A61C14" />
            <Text className="text-[#A61C14] font-inter-bold text-sm ml-1.5">Sign Out</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <AccountSetupSheet
        visible={setupVisible}
        mode={setupMode}
        initialValues={
          setupMode === 'finish'
            ? { firstName: profile?.first_name, lastName: profile?.last_name, phone: profile?.phone }
            : undefined
        }
        onClose={() => setSetupVisible(false)}
        onDone={
          setupMode === 'upgrade'
            ? handleAccountCreated
            : () => {
                setSetupVisible(false);
                Alert.alert("You're All Set!", 'You can now sign out and sign back in anytime with your email and password.');
              }
        }
      />
    </View>
  );
}
