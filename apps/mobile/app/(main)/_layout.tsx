import { useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Tabs, useRouter, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { useLocationStore } from '../../store/locationStore';
import { useCartStore } from '../../store/cartStore';

export default function MainLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { session } = useAuthStore();
  const isAnonymous = session?.user?.is_anonymous ?? false;
  const { locationId, isLoaded, loadSavedLocation } = useLocationStore();
  const items = useCartStore((state) => state.items);

  useEffect(() => {
    if (!isLoaded) loadSavedLocation();
  }, [isLoaded]);

  const itemCount = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);
  const cartTotal = useMemo(() => items.reduce((sum, item) => sum + item.totalPrice, 0), [items]);

  // Hidden on the cart screen itself (redundant with the checkout button
  // right there) and on the item customization screen, which already has
  // its own fixed "Add to Cart - $X.XX" button pinned to the bottom -- the
  // floating bar would otherwise sit right on top of it.
  const isInsideCart = segments.includes('cart') || segments.includes('item');

  return (
    <View className="flex-1 bg-[#FAF6F0]">
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: '#A61C14',
          tabBarInactiveTintColor: '#78716C',
          tabBarStyle: {
            backgroundColor: '#FAF6F0',
            borderTopColor: '#E7E5E4',
            height: 60,
            paddingBottom: 8,
            paddingTop: 6,
          },
          tabBarLabelStyle: {
            fontFamily: 'Inter_600SemiBold',
            fontSize: 11,
          },
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="menu/[id]"
          options={{
            title: 'Menu',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'restaurant' : 'restaurant-outline'} size={22} color={color} />
            ),
            // Always shown now, rather than disappearing from the bar
            // entirely until a location is picked -- tapping it with no
            // location falls back to the picker instead of the tab being
            // invisible with no explanation.
            href: locationId ? { pathname: '/(main)/menu/[id]', params: { id: locationId } } : '/(main)',
          }}
        />
        <Tabs.Screen
          name="deals"
          options={{
            title: 'Rewards',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'gift' : 'gift-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            title: 'Orders',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={22} color={color} />
            ),
            // Guest sessions are anonymous Supabase users, not throwaway --
            // the session (and its orders) persists until they explicitly
            // sign out via the Sign Out tab, so tracking works the same as
            // for registered users.
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
            ),
            href: isAnonymous ? null : undefined,
          }}
        />
        <Tabs.Screen
          name="guest-exit"
          options={{
            title: 'Sign Out',
            tabBarIcon: ({ color }) => <Ionicons name="log-out-outline" size={22} color={color} />,
            href: isAnonymous ? undefined : null,
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: 'More',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'menu' : 'menu-outline'} size={22} color={color} />
            ),
          }}
        />

        {/* Hidden screens -- "index" (location picker) is no longer its own
            tab, but stays reachable: '/(main)' is still the fallback route
            used throughout the app (e.g. the auth guard in app/_layout.tsx,
            and the Menu tab above when no location is set yet). */}
        <Tabs.Screen name="index" options={{ href: null }} />
        <Tabs.Screen
          name="spin-wheel"
          options={{
            href: null,
            // Mandatory first-run screen -- the tab bar must not offer an
            // escape hatch around it, so it's hidden entirely while this
            // screen is focused (React Navigation restores the normal
            // tabBarStyle automatically once the user navigates away).
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen name="cart" options={{ href: null }} />
        <Tabs.Screen name="item/[id]" options={{ href: null }} />
        <Tabs.Screen name="order/[id]" options={{ href: null }} />
        <Tabs.Screen name="edit-profile" options={{ href: null }} />
        <Tabs.Screen name="menu-category" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="customer-support" options={{ href: null }} />
        <Tabs.Screen name="privacy" options={{ href: null }} />
        <Tabs.Screen name="legal" options={{ href: null }} />
      </Tabs>

      {/* Floating cart bar -- one implementation shared across every tab
          instead of a separate "View Cart" button duplicated per screen,
          so it reflects the live item count/total everywhere, not just on
          the menu. */}
      {itemCount > 0 && !isInsideCart && (
        <View className="absolute bottom-20 left-4 right-4 z-50">
          <TouchableOpacity
            onPress={() => router.push('/(main)/cart')}
            className="bg-[#A61C14] py-3.5 px-4 rounded-2xl flex-row items-center justify-between shadow-lg active:bg-[#85140E]"
            activeOpacity={0.9}
          >
            <View className="flex-row items-center">
              <View className="bg-white/20 px-2.5 py-1 rounded-full mr-2.5">
                <Text className="text-[#F4ECE1] font-inter-bold text-xs">{itemCount}</Text>
              </View>
              <Text className="text-[#F4ECE1] font-inter-bold text-base">View Cart</Text>
            </View>
            <View className="flex-row items-center">
              <Text className="text-[#F4ECE1] font-inter-bold text-base mr-1.5">${cartTotal.toFixed(2)}</Text>
              <Ionicons name="arrow-forward" size={16} color="#F4ECE1" />
            </View>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
