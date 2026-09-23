import { View, Text, TouchableOpacity, ScrollView, Alert, Linking, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useCartStore } from '../../store/cartStore';
import { useLocations } from '../../hooks/useLocations';
import { isOpenNow, getTodayHoursLabel } from '../../lib/hours';

const MENU_ITEMS = [
  { label: 'Change Location', icon: 'location-outline', route: '/(main)' },
  { label: 'Settings', icon: 'settings-outline', route: '/(main)/settings' },
  { label: 'Customer Support', icon: 'help-buoy-outline', route: '/(main)/customer-support' },
  { label: 'Privacy', icon: 'shield-checkmark-outline', route: '/(main)/privacy' },
  { label: 'Legal', icon: 'document-text-outline', route: '/(main)/legal' },
];

// Apple Maps on iOS, Google Maps everywhere else -- each phone's own default
// maps app, opened straight into directions to the store.
function openDirections(address: string) {
  const destination = encodeURIComponent(address);
  const url = Platform.OS === 'ios'
    ? `http://maps.apple.com/?daddr=${destination}`
    : `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
  Linking.openURL(url).catch(() => Alert.alert("Couldn't open maps", 'Please try again.'));
}

export default function MoreScreen() {
  const router = useRouter();
  const { session, setSession } = useAuthStore();
  const isAnonymous = session?.user?.is_anonymous ?? false;
  const { data: locations } = useLocations();
  const hasCartItems = useCartStore((state) => state.items.length > 0);

  // Guests have no Profile tab (and so no Sign Out there) -- this used to be
  // its own tab in the bottom bar, which spent a whole slot on something
  // used once. Signing out of an anonymous session is irreversible (there's
  // no way to log back into it), so it still confirms first.
  const handleGuestSignOut = () => {
    Alert.alert(
      'End Guest Session?',
      "Signing out ends this guest session for good -- any orders you've placed as a guest won't be viewable again afterward. Create an account instead if you want to keep your order history.",
      [
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
      ]
    );
  };

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-16 px-4">
      <Text className="text-2xl font-display-bold text-[#1C1917] tracking-tight mb-4">More</Text>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: hasCartItems ? 96 : 32 }}>
        {!!locations?.length && (
          <>
            <Text className="text-xs font-inter-bold uppercase tracking-wider text-[#78716C] mb-2 px-1">
              Our Locations
            </Text>
            {locations.map((location: any) => {
              const open = isOpenNow(location.hours);
              const hoursLabel = getTodayHoursLabel(location.hours);

              return (
                <View
                  key={location.id}
                  className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 mb-3"
                >
                  <Text className="text-base font-inter-bold text-[#1C1917]">{location.name}</Text>
                  {!!location.address && (
                    <Text className="text-stone-500 text-xs mt-0.5">{location.address}</Text>
                  )}

                  <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-stone-100">
                    <View className="flex-row items-center flex-1 mr-2">
                      <View className={`w-2 h-2 rounded-full mr-1.5 ${open ? 'bg-emerald-500' : 'bg-stone-300'}`} />
                      <Text
                        className={`text-xs font-inter-semibold ${open ? 'text-emerald-700' : 'text-stone-500'}`}
                        numberOfLines={1}
                      >
                        {open ? 'Open now' : 'Closed'}{hoursLabel ? ` • Today ${hoursLabel}` : ''}
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
            <View className="h-3" />
          </>
        )}

        <View className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          {MENU_ITEMS.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              onPress={() => router.push(item.route as any)}
              className={`flex-row items-center justify-between p-4 ${
                index < MENU_ITEMS.length - 1 ? 'border-b border-stone-100' : ''
              }`}
            >
              <View className="flex-row items-center">
                <Ionicons name={item.icon as any} size={20} color="#A61C14" style={{ width: 28 }} />
                <Text className="text-sm font-inter-semibold text-[#1C1917]">{item.label}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#A8A29E" />
            </TouchableOpacity>
          ))}
        </View>

        {isAnonymous && (
          <TouchableOpacity
            onPress={handleGuestSignOut}
            className="bg-red-50 p-3.5 rounded-2xl w-full items-center border border-red-200 mt-4 active:bg-red-100"
          >
            <Text className="text-[#A61C14] font-inter-bold text-sm">Sign Out of Guest Session</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}
