import { useEffect, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Tabs, usePathname, useRouter, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocationStore } from '../../store/locationStore';
import { useCartStore } from '../../store/cartStore';
import { useNavStore } from '../../store/navStore';
import { tabularNums } from '../../lib/typography';
import { useCartTotals } from '../../hooks/useCartTotals';
import { useTabBadges } from '../../hooks/useTabBadges';
import { useBirthdayTreat } from '../../lib/birthday';

// Small dot on a tab icon's top-right corner.
function TabDot({ color }: { color: string }) {
  return (
    <View
      style={{
        position: 'absolute',
        top: -2,
        right: -5,
        width: 9,
        height: 9,
        borderRadius: 4.5,
        backgroundColor: color,
        borderWidth: 1.5,
        borderColor: '#FAF6F0',
      }}
    />
  );
}

// The Orders tab's "your food is on its way" dot -- a green dot with a soft
// ring pulsing out of it.
function PulsingDot() {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.ease) }), -1, false);
  }, [pulse]);
  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.6 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 1.4 }],
  }));
  return (
    <View style={{ position: 'absolute', top: -2, right: -5, width: 9, height: 9 }}>
      <Animated.View
        style={[{ position: 'absolute', width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#16A34A' }, ringStyle]}
      />
      <TabDot color="#16A34A" />
    </View>
  );
}

export default function MainLayout() {
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();
  const { locationId, isLoaded, loadSavedLocation } = useLocationStore();
  const orderStarted = useNavStore((state) => state.orderStarted);
  const showMenuTab = orderStarted && !!locationId;
  const onHome = pathname === '/';
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

  // Also hidden over the welcome wheel, which is a full screen of its own.
  const hideCartBar =
    segments.includes('cart') ||
    segments.includes('item') ||
    segments.includes('spin-wheel') ||
    segments.includes('deal-pick' as any);

  const { hasActiveOrder, hasNewPrize, markPrizesSeen, refreshIfStale } = useTabBadges();
  useBirthdayTreat();
  const onDeals = segments.includes('deals');
  useEffect(() => {
    refreshIfStale();
  }, [segments.join('/'), refreshIfStale]);
  // Opening Deals is "seeing" the new prize.
  useEffect(() => {
    if (onDeals) markPrizesSeen();
  }, [onDeals, markPrizesSeen]);

  // The View Cart bar slides up (with a little spring) when the cart goes
  // from empty to having something in it -- not every time it reappears
  // after leaving the cart screen. If the first item goes in while the bar
  // is hidden (from an item's own screen), it slides up once it shows.
  const barTranslateY = useSharedValue(0);
  const pendingEntrance = useRef(false);
  const hadItems = useRef(itemCount > 0);
  const barVisible = itemCount > 0 && !hideCartBar;
  useEffect(() => {
    if (itemCount > 0 && !hadItems.current) pendingEntrance.current = true;
    hadItems.current = itemCount > 0;
    if (barVisible && pendingEntrance.current) {
      pendingEntrance.current = false;
      barTranslateY.value = 90;
      barTranslateY.value = withSpring(0, { damping: 14, stiffness: 160, mass: 0.8 });
    }
  }, [itemCount, barVisible, barTranslateY]);
  const barStyle = useAnimatedStyle(() => ({ transform: [{ translateY: barTranslateY.value }] }));

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
        {/* "Home" (back to the Home screen) until the customer picks Pickup
            or Delivery, then "Menu" for the rest of the session. Home itself
            is a hidden route, so while it's showing this tab is drawn as the
            current one. */}
        <Tabs.Screen
          name="menu/[id]"
          options={{
            title: showMenuTab ? 'Menu' : 'Home',
            tabBarIcon: ({ color, focused }) =>
              showMenuTab ? (
                <Ionicons name={focused ? 'restaurant' : 'restaurant-outline'} size={22} color={color} />
              ) : (
                <Ionicons name={focused || onHome ? 'home' : 'home-outline'} size={22} color={color} />
              ),
            tabBarInactiveTintColor: !showMenuTab && onHome ? '#A61C14' : '#78716C',
            href: showMenuTab ? { pathname: '/(main)/menu/[id]', params: { id: locationId } } : '/(main)',
          }}
        />
        <Tabs.Screen
          name="deals"
          options={{
            title: 'Deals',
            tabBarIcon: ({ color, focused }) => (
              <View>
                <Ionicons name={focused ? 'gift' : 'gift-outline'} size={22} color={color} />
                {hasNewPrize && !onDeals && <TabDot color="#D4A017" />}
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            title: 'Orders',
            tabBarIcon: ({ color, focused }) => (
              <View>
                <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={22} color={color} />
                {hasActiveOrder && <PulsingDot />}
              </View>
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
        {/* Picking a meal for a Mix & Match deal: a focused flow, no tab bar. */}
        <Tabs.Screen name="deal-pick" options={{ href: null, tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="item/[id]" options={{ href: null }} />
        <Tabs.Screen name="order/[id]" options={{ href: null }} />
        <Tabs.Screen name="edit-profile" options={{ href: null }} />
        <Tabs.Screen name="menu-category" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="customer-support" options={{ href: null }} />
        <Tabs.Screen name="privacy" options={{ href: null }} />
        <Tabs.Screen name="legal" options={{ href: null }} />
      </Tabs>

      {barVisible && (
        <Animated.View className="absolute left-4 right-4 z-50" style={[{ bottom: tabBarHeight + 20 }, barStyle]}>
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
        </Animated.View>
      )}
    </View>
  );
}