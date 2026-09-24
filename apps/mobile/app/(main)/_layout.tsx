import { useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Tabs, useRouter, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocationStore } from '../../store/locationStore';
import { useCartStore } from '../../store/cartStore';
import { tabularNums } from '../../lib/typography';
import { useCartTotals } from '../../hooks/useCartTotals';

export default function MainLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { locationId, isLoaded, loadSavedLocation } = useLocationStore();
  const items = useCartStore((state) => state.items);
  // A fixed tab bar height ignores the phone's bottom safe area (the iPhone
  // home indicator, Android's navigation bar) -- the labels end up squeezed
  // into / drawn under it. Adding the inset keeps 60px of real tab space.
  const insets = useSafeAreaInsets();
  const tabBarHeight = 60 + insets.bottom;

  useEffect(() => {
    if (!isLoaded) loadSavedLocation();
  }, [isLoaded, loadSavedLocation]);

  const itemCount = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);
  // Same numbers as the cart: after the applied promo, with tax -- so the
  // total at checkout is never a surprise.
  const { total: cartTotal } = useCartTotals();

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
            height: tabBarHeight,
            paddingBottom: 8 + insets.bottom,
            paddingTop: 6,
          },
          // Every tab's padding comes out of a ~75px-wide slot on a phone;
          // dropping it gives labels the full width before they'd truncate.
          tabBarItemStyle: { paddingHorizontal: 0 },
          tabBarLabelStyle: {
            fontFamily: 'Inter_600SemiBold',
            fontSize: 11,
            // The navigator's default label style adds fontWeight '500' for
            // the system font -- on a single-weight custom font that can
            // make the phone synthesize/measure a different weight than the
            // one it draws. The weight is already baked into the font file.
            fontWeight: 'normal',
          },
          // Labels are single-line, so a phone set to large text would cut
          // them off ("Prof…"). The icons carry the meaning at any size.
          tabBarAllowFontScaling: false,
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
            title: 'Deals',
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
        <View className="absolute left-4 right-4 z-50" style={{ bottom: tabBarHeight + 20 }}>
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
              <View className="items-end mr-1.5">
                <Text className="text-[#F4ECE1] font-inter-bold text-base leading-5" style={tabularNums}>${cartTotal.toFixed(2)}</Text>
                <Text className="text-[#F4ECE1] opacity-75 text-[10px] font-inter-semibold leading-3">incl. tax</Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color="#F4ECE1" />
            </View>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}