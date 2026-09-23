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
  }, [isLoaded, loadSavedLocation]);

  const itemCount = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);
  const cartTotal = useMemo(() => items.reduce((sum, item) => sum + item.totalPrice, 0), [items]);

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

        {/* Hidden routes */}
        <Tabs.Screen name="index" options={{ href: null }} />
        <Tabs.Screen
          name="spin-wheel"
          options={{
            href: null,
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