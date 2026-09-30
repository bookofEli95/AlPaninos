import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { Alert } from '../../lib/alert';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { setStatusBarStyle } from 'expo-status-bar';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import Animated, {
  Easing,
  FadeInDown,
  interpolate,
  Extrapolation,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useCartStore } from '../../store/cartStore';
import SkeletonBox from '../../components/Skeleton';
import { useLocationStore } from '../../store/locationStore';
import { useNavStore } from '../../store/navStore';
import { reorderUsualItem } from '../../lib/reorder';
import { distanceKm } from '../../lib/geo';
import { storeStatus } from '../../lib/hours';
import { useLocations } from '../../hooks/useLocations';
import { useProfile } from '../../hooks/useProfile';
import { useDrops } from '../../hooks/useDrops';
import { getDaypart } from '../../lib/daypart';
import { dropLabel, dropState } from '../../lib/drops';
import { switchStore } from '../../lib/storeSwitch';
import { useCartBarSpace } from '../../hooks/useCartBarSpace';
import { canOrderAsap, estimateReadyMinutes, formatDayAndTime, getEtaDisplay, getOrderDays } from '../../lib/orderTiming';
import OrderTypeSheet from '../../components/OrderTypeSheet';

// Home: a full-screen showcase of the food, and one decision -- Pickup or
// Delivery -- from the store that's already picked for them. Everything
// else (a live order, the latest drop, their usual, time-of-day picks and
// every store) is one swipe up.

const SCREEN = Dimensions.get('window');
// Tall enough to feel like a poster, short enough that the first card of
// the extras peeks up from the bottom as a hint to swipe.
const HERO_HEIGHT = Math.round(SCREEN.height * 0.78);
const SLIDE_MS = 3000;
const MAX_SLIDES = 6;
// The same "on its way" statuses as the Orders tab's live dot.
const ACTIVE_STATUSES = ['received', 'preparing', 'ready', 'out_for_delivery'];

// One dish in the hero slideshow. `key` is its name, normalised -- the same
// dish has a different id at every store.
type HeroItem = { key: string; name: string; image_url: string };
const dishKey = (name: string) => name.trim().toLowerCase();

// One photo in the hero slideshow: fades in when it becomes the active one
// and slowly pushes in (a "Ken Burns" zoom) while it's showing.
function HeroSlide({ uri, active }: { uri: string; active: boolean }) {
  const opacity = useSharedValue(active ? 1 : 0);
  const scale = useSharedValue(1);
  useEffect(() => {
    opacity.value = withTiming(active ? 1 : 0, { duration: 900, easing: Easing.inOut(Easing.quad) });
    if (active) {
      scale.value = 1;
      scale.value = withTiming(1.12, { duration: SLIDE_MS + 1500, easing: Easing.linear });
    }
  }, [active, opacity, scale]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  return <Animated.Image source={{ uri }} style={[StyleSheet.absoluteFill, style]} resizeMode="cover" />;
}

// A store card's Pickup / Delivery button: outlined (neither one looks
// picked), and when tapped it flashes red three times, fast, then carries
// on -- staying red while the menu loads. The red is a second copy of the
// button laid on top, faded in and out, so the flash never re-renders.
const FLASH_ON = { duration: 45 };
const FLASH_OFF = { duration: 65 };
const FLASH_MS = 45 * 3 + 65 * 2;

function StoreOrderButton({
  label,
  icon,
  loading,
  disabled,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  loading: boolean;
  disabled: boolean;
  onPress: () => Promise<void>;
}) {
  const flash = useSharedValue(0);
  const busy = useRef(false);
  const litStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  const handlePress = () => {
    if (busy.current) return;
    busy.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    flash.value = withSequence(
      withTiming(1, FLASH_ON),
      withTiming(0, FLASH_OFF),
      withTiming(1, FLASH_ON),
      withTiming(0, FLASH_OFF),
      withTiming(1, FLASH_ON)
    );
    setTimeout(async () => {
      try {
        await onPress();
      } finally {
        busy.current = false;
        flash.value = withTiming(0, { duration: 220 });
      }
    }, FLASH_MS);
  };

  const content = (color: string) =>
    loading ? (
      <ActivityIndicator size="small" color={color} />
    ) : (
      <>
        <Ionicons name={icon} size={16} color={color} />
        <Text style={[styles.storeButtonText, { color }]}>{label}</Text>
      </>
    );

  return (
    <TouchableOpacity onPress={handlePress} disabled={disabled} activeOpacity={1} style={styles.storeButton}>
      {content('#A61C14')}
      <Animated.View pointerEvents="none" style={[styles.storeButtonLit, litStyle]}>
        {content('#F4ECE1')}
      </Animated.View>
    </TouchableOpacity>
  );
}

// The hero's big Pickup / Delivery button. Unpicked it's cream with an
// empty circle; picked it turns red, says to tap again, and a second tap
// starts the order.
function HeroOrderButton({
  title,
  icon,
  sub,
  selected,
  loading,
  disabled,
  onPress,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  sub: string;
  selected: boolean;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (!selected) return;
    scale.value = withSequence(withTiming(0.96, { duration: 70 }), withTiming(1, { duration: 160 }));
  }, [selected, scale]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const fg = selected ? '#F4ECE1' : '#1C1917';
  return (
    <Animated.View style={popStyle}>
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.88}
        style={[styles.bigButton, { backgroundColor: selected ? '#A61C14' : '#FAF6F0' }]}
      >
        <View
          style={[styles.bigButtonIcon, { backgroundColor: selected ? 'rgba(255,255,255,0.16)' : 'rgba(166,28,20,0.1)' }]}
        >
          <Ionicons name={icon} size={20} color={selected ? '#F4ECE1' : '#A61C14'} />
        </View>
        <View className="flex-1">
          <Text style={[styles.bigButtonTitle, { color: fg }]}>{title}</Text>
          <Text
            style={[styles.bigButtonSub, { color: selected ? 'rgba(244,236,225,0.9)' : '#78716C' }]}
            numberOfLines={1}
          >
            {selected ? 'Tap again to start your order' : sub}
          </Text>
        </View>
        {loading ? (
          <ActivityIndicator color={fg} />
        ) : selected ? (
          <Ionicons name="arrow-forward-circle" size={30} color="#F4ECE1" />
        ) : (
          <Ionicons name="ellipse-outline" size={26} color="#A8A29E" />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// A pulsing green dot, for the live order card.
function LiveDot() {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.ease) }), -1, false);
  }, [pulse]);
  const ring = useAnimatedStyle(() => ({
    opacity: 0.6 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 1.6 }],
  }));
  return (
    <View style={{ width: 10, height: 10 }}>
      <Animated.View style={[styles.liveDot, ring]} />
      <View style={styles.liveDot} />
    </View>
  );
}

const LIVE_STATUS_TEXT: Record<string, string> = {
  received: 'Order received',
  preparing: 'In the press',
  ready: 'Ready for pickup!',
  out_for_delivery: 'On its way to you',
};

export default function HomeScreen() {
  const cartBarSpace = useCartBarSpace();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuthStore();
  const userId = session?.user?.id;
  const isAnonymous = session?.user?.is_anonymous ?? false;
  const { deliveryAddress, setDeliveryAddress, setOrderType } = useCartStore();
  const cartLocationId = useCartStore((state) => (state.items.length > 0 ? state.locationId : null));
  const itemCount = useCartStore((state) => state.items.reduce((sum, item) => sum + item.quantity, 0));
  const setLocationId = useLocationStore((state) => state.setLocationId);
  const storedLocationId = useLocationStore((state) => state.locationId);
  const { data: profile } = useProfile();

  // Re-read the clock whenever Home is shown (it's a tab and stays
  // mounted), so the greeting, picks and store hours are right later on.
  const [now, setNow] = useState(() => new Date());
  const daypart = getDaypart(now);

  const [sheetVisible, setSheetVisible] = useState(false);
  // Tapped Delivery with no address yet: the sheet opens to ask for one,
  // and closing it with an address carries on to the menu.
  const [deliveryPending, setDeliveryPending] = useState(false);
  const [addingUsual, setAddingUsual] = useState(false);
  // What's loading: 'pickup' / 'delivery' for the hero buttons, or
  // '<storeId>:pickup' / '<storeId>:delivery' for a store card's buttons.
  const [going, setGoing] = useState<string | null>(null);
  // Which of the hero's Pickup / Delivery has been picked (first tap) --
  // nothing each time Home is opened.
  const [chosen, setChosen] = useState<'pickup' | 'delivery' | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locatingUser, setLocatingUser] = useState(false);

  // The hero sits under a dark photo -- light status bar here, dark again
  // when leaving (every other screen is light). Back to the top each time
  // Home is opened, too.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
      setChosen(null);
      setStatusBarStyle('light');
      (scrollRef.current as any)?.scrollTo?.({ y: 0, animated: false });
      // Keep the store's open/closed status current while Home is showing.
      const clock = setInterval(() => setNow(new Date()), 60000);
      return () => {
        clearInterval(clock);
        setStatusBarStyle('dark');
      };
    }, [scrollRef])
  );

  // A registered customer's saved address, ready for Delivery.
  useEffect(() => {
    if (!userId || isAnonymous || deliveryAddress) return;
    (async () => {
      const { data, error } = await (supabase as any).from('profiles').select('address').eq('id', userId).single();
      if (!error && data?.address && !useCartStore.getState().deliveryAddress) setDeliveryAddress(data.address);
    })();
  }, [userId, isAnonymous, deliveryAddress, setDeliveryAddress]);

  // Where the customer is right now, to start them at their nearest store.
  // Asks for location the first time (the phone only ever asks once); if
  // it's refused or can't be had, Home falls back to the last store used.
  // `locationChecked` holds back the store line until this has had a go
  // (at most 4 seconds), so it doesn't flash last time's store first.
  const [locationChecked, setLocationChecked] = useState(false);
  useEffect(() => {
    const giveUp = setTimeout(() => setLocationChecked(true), 4000);
    (async () => {
      try {
        let { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
        if (status === 'undetermined' && canAskAgain) {
          ({ status } = await Location.requestForegroundPermissionsAsync());
        }
        if (status !== 'granted') return;
        const position =
          (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60000 })) ??
          (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        if (position) setUserCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
      } catch {
      } finally {
        clearTimeout(giveUp);
        setLocationChecked(true);
      }
    })();
    return () => clearTimeout(giveUp);
  }, []);

  const { data: locations, isLoading, error: locationsError, refetch: refetchLocations } = useLocations();

  const sortedLocations = useMemo(() => {
    if (!locations) return [];
    const withDistance = locations.map((loc: any) => ({
      ...loc,
      distanceKm:
        userCoords && loc.latitude != null && loc.longitude != null
          ? distanceKm(userCoords.lat, userCoords.lng, loc.latitude, loc.longitude)
          : null,
    }));
    if (!userCoords) return withDistance;
    return withDistance.sort((a: any, b: any) => {
      if (a.distanceKm == null && b.distanceKm == null) return 0;
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });
  }, [locations, userCoords]);

  // The store Pickup and Delivery order from: the one the cart is already
  // from, else one they picked themselves since opening the app, else the
  // nearest (when the phone's location is known), else the last one used,
  // else the first one that's open now. Every launch (and sign-in) starts
  // from the nearest -- they may be in St. Thomas today and London tomorrow.
  const pickedThisSession = useLocationStore((state) => state.pickedThisSession);
  const selectedStore = useMemo(() => {
    if (!sortedLocations.length) return null;
    return (
      sortedLocations.find((l: any) => l.id === cartLocationId) ??
      (pickedThisSession ? sortedLocations.find((l: any) => l.id === storedLocationId) : null) ??
      (userCoords ? sortedLocations[0] : null) ??
      sortedLocations.find((l: any) => l.id === storedLocationId) ??
      sortedLocations.find((l: any) => storeStatus(l.hours, now).open) ??
      sortedLocations[0]
    );
  }, [sortedLocations, cartLocationId, pickedThisSession, storedLocationId, userCoords, now]);

  // Make the nearest store the current one everywhere else too (the store
  // sheet, the Menu tab), not just on Home.
  useEffect(() => {
    if (!userCoords || pickedThisSession || cartLocationId) return;
    const nearest = sortedLocations[0];
    if (nearest && nearest.distanceKm != null && nearest.id !== storedLocationId) {
      useLocationStore.getState().setNearestLocationId(nearest.id);
    }
  }, [userCoords, pickedThisSession, cartLocationId, sortedLocations, storedLocationId]);
  const selectedStatus = selectedStore ? storeStatus(selectedStore.hours, now) : null;
  const selectedStoreId: string | null = selectedStore?.id ?? null;

  // ---- Time-of-day picks (the row below the hero) ------------------------
  const { data: picks } = useQuery({
    queryKey: ['daypartPicks', selectedStoreId, daypart.daypart],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_daypart_picks', {
        p_location_id: selectedStoreId,
        p_daypart: daypart.daypart,
        p_limit: 6,
      });
      if (error) throw error;
      return (data || []) as { id: string; name: string; base_price: number; image_url: string | null; location_id: string }[];
    },
    enabled: !!selectedStoreId,
    staleTime: 5 * 60000,
  });

  // ---- The hero's food photos ---------------------------------------------
  // The same slideshow whichever store is picked -- changing the store never
  // changes the photos. Drawn from every store's menu, one photo per dish
  // (each store has its own copy of every item): sandwiches first (they're
  // the star), then wraps, then anything else with a photo. Nothing
  // unavailable, catering-only, from the secret menu or an upcoming drop.
  const { data: heroPool } = useQuery({
    queryKey: ['homeHeroPhotos'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('menu_items')
        .select('name, image_url, is_available, is_catering, drop_starts_at, menu_categories ( name, is_secret )')
        .not('image_url', 'is', null)
        .order('id')
        .limit(1000);
      if (error) throw error;
      return (data || []) as any[];
    },
    staleTime: 30 * 60000,
  });

  const heroItems: HeroItem[] = useMemo(() => {
    const rank = (m: any) => {
      const category = m.menu_categories?.name ?? '';
      if (category === 'The Mob') return 0;
      if (category === "Al's Wraps") return 1;
      return 2;
    };
    const seen = new Set<string>();
    const dishes: any[] = [];
    for (const m of heroPool ?? []) {
      if (!m.image_url || m.is_available === false || m.is_catering || m.menu_categories?.is_secret || m.drop_starts_at) continue;
      const key = dishKey(m.name);
      if (seen.has(key)) continue;
      seen.add(key);
      dishes.push(m);
    }
    // By name within each group, so the order never depends on which
    // store's rows came back first.
    dishes.sort((a, b) => rank(a) - rank(b) || (dishKey(a.name) < dishKey(b.name) ? -1 : 1));
    return dishes.slice(0, MAX_SLIDES).map((m) => ({ key: dishKey(m.name), name: m.name, image_url: m.image_url }));
  }, [heroPool]);

  // The picked store's own copy of each dish -- for the photo label's price,
  // and to open the dish at that store when the label is tapped.
  const { data: storeMenu } = useQuery({
    queryKey: ['homeStoreMenu', selectedStoreId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('menu_items')
        .select('id, name, base_price, is_available')
        .eq('location_id', selectedStoreId);
      if (error) throw error;
      return (data || []) as { id: string; name: string; base_price: number; is_available: boolean | null }[];
    },
    enabled: !!selectedStoreId,
    staleTime: 10 * 60000,
  });

  useEffect(() => {
    heroItems.forEach((item) => Image.prefetch(item.image_url).catch(() => {}));
  }, [heroItems]);

  // The slideshow only runs while Home is on screen.
  const [slideIndex, setSlideIndex] = useState(0);
  useFocusEffect(
    useCallback(() => {
      if (heroItems.length < 2) return;
      const timer = setInterval(() => setSlideIndex((i) => (i + 1) % heroItems.length), SLIDE_MS);
      return () => clearInterval(timer);
    }, [heroItems.length])
  );
  const currentSlide = heroItems.length ? heroItems[slideIndex % heroItems.length] : null;
  // Null when the picked store doesn't sell the dish in the photo -- the
  // label then shows just its name.
  const slideAtStore = useMemo(
    () =>
      currentSlide
        ? storeMenu?.find((m) => m.is_available !== false && dishKey(m.name) === currentSlide.key) ?? null
        : null,
    [currentSlide, storeMenu]
  );

  // ---- Extras below the hero ----------------------------------------------
  const { data: liveOrder } = useQuery({
    queryKey: ['homeLiveOrder', userId],
    queryFn: async () => {
      const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const { data, error } = await (supabase as any)
        .from('orders')
        .select('id, status, order_type, estimated_ready_at, requested_ready_at, locations ( name )')
        .eq('user_id', userId)
        .in('status', ACTIVE_STATUSES)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!userId,
    staleTime: 15000,
    refetchInterval: 60000,
  });
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`home-live-order-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${userId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['homeLiveOrder', userId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  const { data: usualItem } = useQuery({
    queryKey: ['usualItem', userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_usual_item');
      if (error) throw error;
      return data?.[0] ?? null;
    },
    enabled: !isAnonymous && !!userId,
  });

  const { data: drops } = useDrops(selectedStoreId);
  const featuredDrop = drops?.[0] ?? null;

  // ---- Actions ------------------------------------------------------------
  const goToMenu = async (storeId: string) => {
    const store = locations?.find((l: any) => l.id === storeId);
    if (!(await switchStore(storeId, store?.name))) return;
    // Pickup / Delivery picked: the first tab is "Menu" from here on.
    useNavStore.getState().setOrderStarted(true);
    router.replace(`/(main)/menu/${storeId}`);
  };

  // Pickup / Delivery: one tap from here to a store's menu -- the picked
  // store for the hero buttons, or a particular store from its card in the
  // store list.
  const handleGo = async (type: 'pickup' | 'delivery', storeId?: string) => {
    const targetId = storeId ?? selectedStoreId;
    if (!targetId || going) return;
    // A store card's button buzzes itself, on the tap, before its flash.
    if (!storeId) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const key = storeId ? `${storeId}:${type}` : type;
    setOrderType(type);
    if (type === 'delivery' && !useCartStore.getState().deliveryAddress) {
      // A store card's Delivery makes that store the one being ordered from
      // first, so the address sheet shows it and carries on to its menu.
      if (targetId !== selectedStoreId) {
        setGoing(key);
        const store = locations?.find((l: any) => l.id === targetId);
        const switched = await switchStore(targetId, store?.name);
        setGoing(null);
        if (!switched) return;
      }
      setDeliveryPending(true);
      setSheetVisible(true);
      return;
    }
    setGoing(key);
    try {
      await goToMenu(targetId);
    } finally {
      setGoing(null);
    }
  };

  // The hero's Pickup / Delivery: the first tap picks one, a second tap on
  // the picked one starts the order.
  const handleHeroPress = (type: 'pickup' | 'delivery') => {
    if (chosen === type) {
      handleGo(type);
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    setChosen(type);
  };

  const handleSheetClose = () => {
    setSheetVisible(false);
    if (!deliveryPending) return;
    setDeliveryPending(false);
    const cart = useCartStore.getState();
    const storeId = cart.items.length > 0 && cart.locationId ? cart.locationId : useLocationStore.getState().locationId ?? selectedStoreId;
    if (cart.orderType === 'delivery' && cart.deliveryAddress && storeId) goToMenu(storeId);
  };

  const openItem = async (itemId: string, itemLocationId: string) => {
    const store = locations?.find((l: any) => l.id === itemLocationId);
    if (!(await switchStore(itemLocationId, store?.name))) return;
    router.push({ pathname: `/(main)/item/${itemId}`, params: { returnTo: 'menu' } });
  };

  const handleOrderUsual = async () => {
    if (!usualItem) return;
    setAddingUsual(true);
    try {
      // The usual is from a particular store; a cart from another store
      // moves over first (asking if anything would be lost).
      const usualStore = locations?.find((l: any) => l.id === usualItem.location_id);
      if (!(await switchStore(usualItem.location_id, usualStore?.name))) return;
      const { locationId: itemLocationId, skipped } = await reorderUsualItem(usualItem.menu_item_id);
      if (skipped) {
        Alert.alert('No Longer Available', `${usualItem.name} isn't available right now.`);
        return;
      }
      setLocationId(itemLocationId);
      router.push('/(main)/cart');
    } catch (e: any) {
      Alert.alert("Couldn't add regular item", e.message);
    } finally {
      setAddingUsual(false);
    }
  };

  const handleUseMyLocation = async () => {
    setLocatingUser(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Needed', 'Enable location access to find the stores nearest you.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      setUserCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
    } catch (e: any) {
      Alert.alert("Couldn't get location", e.message);
    } finally {
      setLocatingUser(false);
    }
  };

  // ---- Parallax: the photos drift up slower than the page, and stretch
  // when pulled down past the top.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  const heroPhotoStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(scrollY.value, [-200, 0, HERO_HEIGHT], [-100, 0, HERO_HEIGHT * 0.45], Extrapolation.CLAMP) },
      { scale: interpolate(scrollY.value, [-200, 0], [1.35, 1], Extrapolation.CLAMP) },
    ],
  }));

  const firstName = profile?.first_name && !isAnonymous ? profile.first_name : null;
  const headline = daypart.daypart === 'lunch' ? 'Lunch, hot off\nthe press.' : 'Dinner, hot off\nthe press.';
  // No hours on file counts as open, rather than telling everyone to order ahead.
  const storeOpen = !selectedStatus || selectedStatus.open || !selectedStatus.label;
  const orderSize = Math.max(itemCount, 1);
  const pickupMinutes = estimateReadyMinutes('pickup', orderSize);
  const deliveryMinutes = estimateReadyMinutes('delivery', orderSize);
  // The same rule as the cart (lib/orderTiming): "ready in ~20 min" only
  // when the store can make it now; otherwise the earliest time it can,
  // e.g. "Order ahead for tomorrow at 11:30 AM".
  const orderAheadLine = (type: 'pickup' | 'delivery') => {
    const first = getOrderDays(selectedStore?.hours, type, orderSize, now)[0]?.slots[0];
    return first ? `Order ahead for ${formatDayAndTime(first.time, now)}` : 'Order ahead for later';
  };
  const pickupNow = canOrderAsap(selectedStore?.hours, 'pickup', orderSize, now);
  const deliveryNow = canOrderAsap(selectedStore?.hours, 'delivery', orderSize, now);

  return (
    <View className="flex-1 bg-[#FAF6F0]">
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 28 + cartBarSpace }}
      >
        {/* ================= HERO ================= */}
        <View style={{ height: HERO_HEIGHT, overflow: 'hidden', backgroundColor: '#1C1917' }}>
          <Animated.View style={[StyleSheet.absoluteFill, heroPhotoStyle]}>
            {heroItems.length ? (
              heroItems.map((item, i) => (
                <HeroSlide key={item.key} uri={item.image_url} active={i === slideIndex % heroItems.length} />
              ))
            ) : (
              // No photos yet: the brand red with the logo, rather than an
              // empty black box.
              <View style={[StyleSheet.absoluteFill, { backgroundColor: '#AE1807', alignItems: 'center', justifyContent: 'center' }]}>
                <Image source={require('../../assets/logo.jpg')} style={{ width: 240, height: 240, opacity: 0.25 }} />
              </View>
            )}
          </Animated.View>

          {/* Dark at the top (for the status bar) and heavier at the bottom (for
              the headline and buttons), clear in the middle for the food. */}
          <Svg pointerEvents="none" width={SCREEN.width} height={HERO_HEIGHT} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="heroFade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#000000" stopOpacity={0.55} />
                <Stop offset="0.24" stopColor="#000000" stopOpacity={0} />
                <Stop offset="0.42" stopColor="#000000" stopOpacity={0} />
                <Stop offset="1" stopColor="#0C0604" stopOpacity={0.94} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={SCREEN.width} height={HERO_HEIGHT} fill="url(#heroFade)" />
          </Svg>

          {/* What's in the photo -- tap to open it at the picked store */}
          <Animated.View
            entering={FadeInDown.duration(500).delay(80)}
            style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12 }}
          >
            {!!currentSlide && (
              <TouchableOpacity
                onPress={() => slideAtStore && selectedStoreId && openItem(slideAtStore.id, selectedStoreId)}
                disabled={!slideAtStore}
                activeOpacity={0.85}
                className={`self-start flex-row items-center rounded-full pl-3 py-1.5 ${slideAtStore ? 'pr-2' : 'pr-3'}`}
                style={styles.photoChip}
              >
                <Text className="text-white font-inter-semibold text-xs" numberOfLines={1}>
                  {currentSlide.name}
                  {slideAtStore ? ` · $${Number(slideAtStore.base_price).toFixed(2)}` : ''}
                </Text>
                {!!slideAtStore && (
                  <Ionicons name="chevron-forward" size={12} color="#FFFFFF" style={{ marginLeft: 2 }} />
                )}
              </TouchableOpacity>
            )}
          </Animated.View>

          {/* Headline, the two big buttons, and the store */}
          <View style={{ position: 'absolute', left: 16, right: 16, bottom: 40 }}>
            <Animated.View entering={FadeInDown.duration(550).delay(160)}>
              <View className="flex-row items-center mb-1">
                <Ionicons name={daypart.icon} size={13} color="#FFE58A" />
                <Text className="text-[#FFE58A] font-inter-bold text-xs ml-1.5 uppercase tracking-widest">
                  {daypart.greeting}
                  {firstName ? `, ${firstName}` : ''}
                </Text>
              </View>
              <Text style={styles.headline}>{headline}</Text>
            </Animated.View>

            {/* Two taps: the first picks Pickup or Delivery, the second (on
                the picked one) starts the order. */}
            <Animated.View entering={FadeInDown.duration(550).delay(260)} className="mt-4" style={{ gap: 10 }}>
              <HeroOrderButton
                title="Pickup"
                icon="bag-handle"
                sub={pickupNow ? `Ready in about ${pickupMinutes} min` : orderAheadLine('pickup')}
                selected={chosen === 'pickup'}
                loading={going === 'pickup'}
                disabled={!selectedStoreId || !!going}
                onPress={() => handleHeroPress('pickup')}
              />
              <HeroOrderButton
                title="Delivery"
                icon="bicycle"
                sub={
                  !deliveryNow
                    ? orderAheadLine('delivery')
                    : deliveryAddress
                    ? `About ${deliveryMinutes} min to ${deliveryAddress.split(',')[0]}`
                    : `About ${deliveryMinutes} min to your door`
                }
                selected={chosen === 'delivery'}
                loading={going === 'delivery'}
                disabled={!selectedStoreId || !!going}
                onPress={() => handleHeroPress('delivery')}
              />
            </Animated.View>

            {/* The store both buttons order from */}
            <Animated.View entering={FadeInDown.duration(550).delay(340)}>
              {isLoading || !locationChecked ? (
                <View className="flex-row items-center mt-3.5">
                  <ActivityIndicator size="small" color="#FFE58A" />
                  <Text className="text-white/80 text-xs font-inter-medium ml-2">Finding your store…</Text>
                </View>
              ) : locationsError ? (
                <TouchableOpacity onPress={() => refetchLocations()} className="flex-row items-center mt-3.5">
                  <Ionicons name="alert-circle-outline" size={15} color="#FFE58A" />
                  <Text className="text-white text-xs font-inter-semibold ml-1.5">
                    Couldn't load stores · <Text className="text-[#FFE58A] underline">Try again</Text>
                  </Text>
                </TouchableOpacity>
              ) : selectedStore ? (
                <TouchableOpacity
                  onPress={() => setSheetVisible(true)}
                  activeOpacity={0.8}
                  className="flex-row items-center mt-3.5"
                  hitSlop={{ top: 8, bottom: 8 }}
                >
                  <Ionicons name="storefront-outline" size={15} color="#FFFFFF" />
                  <View className="flex-1 ml-2 mr-2">
                    <Text className="text-white text-xs font-inter-bold" numberOfLines={1}>
                      From {selectedStore.name}
                      {selectedStore.distanceKm != null ? ` · ${selectedStore.distanceKm.toFixed(1)} km` : ''}
                    </Text>
                    {!!selectedStatus?.label && (
                      <View className="flex-row items-center mt-0.5">
                        <View style={[styles.statusDot, { backgroundColor: storeOpen ? '#34D399' : '#FBBF24' }]} />
                        <Text className="text-white/80 text-[11px] font-inter-medium">{selectedStatus.label}</Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-[#FFE58A] text-xs font-inter-bold underline">Change</Text>
                </TouchableOpacity>
              ) : null}
            </Animated.View>
          </View>
        </View>

        {/* ================= EXTRAS (one swipe up) ================= */}
        <View style={styles.extras}>
          <View className="self-center w-10 h-1 rounded-full bg-stone-300 mb-4" />

          {/* Live order */}
          {!!liveOrder && (
            <TouchableOpacity
              onPress={() => router.push(`/(main)/order/${liveOrder.id}`)}
              activeOpacity={0.85}
              className="bg-white rounded-2xl border border-emerald-200 p-3.5 mb-4 flex-row items-center shadow-sm"
            >
              <View className="w-11 h-11 rounded-full bg-emerald-50 items-center justify-center mr-3">
                <LiveDot />
              </View>
              <View className="flex-1 mr-2">
                <Text className="text-[10px] font-inter-bold uppercase tracking-wider text-emerald-700">
                  Live Order{liveOrder.locations?.name ? ` · ${liveOrder.locations.name}` : ''}
                </Text>
                <Text className="text-base font-inter-bold text-[#1C1917]" numberOfLines={1}>
                  {liveOrder.status === 'ready' && liveOrder.order_type === 'delivery'
                    ? 'Almost ready'
                    : LIVE_STATUS_TEXT[liveOrder.status] ?? 'In progress'}
                </Text>
                {(() => {
                  const eta = getEtaDisplay(
                    liveOrder.estimated_ready_at,
                    liveOrder.status,
                    liveOrder.order_type,
                    liveOrder.requested_ready_at
                  );
                  return eta ? <Text className="text-xs text-stone-500" numberOfLines={1}>{eta}</Text> : null;
                })()}
              </View>
              <Text className="text-emerald-700 font-inter-bold text-xs mr-0.5">Track</Text>
              <Ionicons name="chevron-forward" size={16} color="#047857" />
            </TouchableOpacity>
          )}

          {/* The latest app-only drop */}
          {featuredDrop && (
            <TouchableOpacity
              onPress={() => openItem(featuredDrop.id, featuredDrop.location_id)}
              activeOpacity={0.85}
              className="bg-[#1C1917] rounded-2xl p-3.5 mb-4 flex-row items-center"
            >
              {featuredDrop.image_url ? (
                <Image source={{ uri: featuredDrop.image_url }} className="w-12 h-12 rounded-xl mr-3 bg-stone-700" resizeMode="cover" />
              ) : (
                <View className="w-12 h-12 rounded-xl mr-3 bg-[#A61C14] items-center justify-center">
                  <Ionicons name="flame" size={22} color="#F4ECE1" />
                </View>
              )}
              <View className="flex-1 mr-2">
                <Text className="text-[10px] font-inter-bold uppercase tracking-wider text-[#F0B4AC]">
                  {dropState(featuredDrop) === 'live' ? 'App-Only Drop • Live Now' : 'App-Only Drop'}
                </Text>
                <Text className="text-base font-inter-bold text-[#F4ECE1]" numberOfLines={1}>
                  {featuredDrop.name}
                </Text>
                <Text className="text-xs text-stone-400" numberOfLines={1}>
                  {dropLabel(featuredDrop)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#F4ECE1" />
            </TouchableOpacity>
          )}

          {/* One-tap repeat */}
          {usualItem && (
            <TouchableOpacity
              onPress={handleOrderUsual}
              disabled={addingUsual}
              activeOpacity={0.85}
              className="bg-white rounded-2xl border border-stone-200 shadow-sm p-3.5 mb-4 flex-row items-center"
            >
              {usualItem.image_url ? (
                <Image source={{ uri: usualItem.image_url }} className="w-14 h-14 rounded-xl mr-3 bg-stone-100" resizeMode="cover" />
              ) : (
                <View className="w-14 h-14 rounded-xl bg-[#FAF6F0] items-center justify-center mr-3">
                  <Ionicons name="restaurant" size={22} color="#A61C14" />
                </View>
              )}
              <View className="flex-1 mr-2">
                <Text className="text-[10px] font-inter-bold uppercase tracking-wider text-[#A61C14]">Reorder Your Usual</Text>
                <Text className="text-base font-inter-bold text-[#1C1917]" numberOfLines={1}>
                  {usualItem.name}
                </Text>
                <Text className="text-stone-400 text-xs">Ordered {usualItem.times_ordered} times</Text>
              </View>
              <View className="bg-[#A61C14] px-3.5 py-2 rounded-xl items-center justify-center">
                {addingUsual ? (
                  <ActivityIndicator color="#F4ECE1" size="small" />
                ) : (
                  <Text className="text-[#F4ECE1] font-inter-bold text-xs">Reorder</Text>
                )}
              </View>
            </TouchableOpacity>
          )}

          {/* Time-of-day picks */}
          {!!picks?.length && (
            <View className="mb-5">
              <View className="flex-row items-center mb-2">
                <Ionicons name={daypart.icon} size={15} color="#A61C14" />
                <View className="flex-1 ml-1.5">
                  <Text className="text-base font-inter-bold text-[#1C1917]">{daypart.title}</Text>
                  <Text className="text-xs text-stone-500" numberOfLines={1}>
                    {daypart.subtitle}
                    {selectedStore?.name ? ` • ${selectedStore.name}` : ''}
                  </Text>
                </View>
              </View>
              <FlatList
                horizontal
                data={picks}
                keyExtractor={(pick) => pick.id}
                showsHorizontalScrollIndicator={false}
                renderItem={({ item: pick }) => (
                  <TouchableOpacity
                    onPress={() => openItem(pick.id, pick.location_id)}
                    activeOpacity={0.85}
                    className="bg-white rounded-2xl border border-stone-200 mr-2.5 overflow-hidden"
                    style={{ width: 140 }}
                  >
                    {pick.image_url ? (
                      <Image source={{ uri: pick.image_url }} className="w-full h-24 bg-stone-200" resizeMode="cover" />
                    ) : (
                      <View className="w-full h-24 bg-[#FAF6F0] items-center justify-center">
                        <Ionicons name="restaurant" size={22} color="#A8A29E" />
                      </View>
                    )}
                    <View className="p-2.5">
                      <Text className="text-xs font-inter-bold text-[#1C1917]" numberOfLines={1}>
                        {pick.name}
                      </Text>
                      <Text className="text-xs font-inter-bold text-[#A61C14] mt-0.5">
                        ${Number(pick.base_price).toFixed(2)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}

          {/* Every store */}
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-base font-inter-bold text-[#1C1917]">Our Stores</Text>
            <TouchableOpacity
              onPress={handleUseMyLocation}
              disabled={locatingUser}
              className="bg-white border border-stone-200 px-3 py-1.5 rounded-full flex-row items-center shadow-sm"
            >
              {locatingUser ? (
                <ActivityIndicator size="small" color="#A61C14" />
              ) : (
                <Ionicons name="navigate-outline" size={14} color="#A61C14" />
              )}
              <Text className="text-[#A61C14] font-inter-bold text-xs ml-1">{userCoords ? 'Nearest first' : 'Nearby'}</Text>
            </TouchableOpacity>
          </View>

          {isLoading ? (
            [1, 2].map((i) => <SkeletonBox key={i} height={110} borderRadius={16} style={{ marginBottom: 12 }} />)
          ) : (
            sortedLocations.map((item: any) => {
              const status = storeStatus(item.hours, now);
              const selected = item.id === selectedStoreId;
              return (
                <View
                  key={item.id}
                  className={`bg-white p-4 rounded-2xl mb-3 border shadow-sm ${selected ? 'border-[#A61C14]' : 'border-stone-200'}`}
                >
                  <View className="flex-row justify-between items-start mb-1">
                    <Text className="text-lg font-inter-bold text-[#1C1917] flex-1 mr-2">{item.name}</Text>
                    {selected ? (
                      <View className="bg-[#A61C14] px-2 py-0.5 rounded-full">
                        <Text className="text-[#F4ECE1] text-[10px] font-inter-bold uppercase">Your Store</Text>
                      </View>
                    ) : item.distanceKm != null ? (
                      <Text className="text-[#A61C14] font-inter-bold text-xs">{item.distanceKm.toFixed(1)} km away</Text>
                    ) : null}
                  </View>
                  <Text className="text-stone-500 text-xs mb-2.5">{item.address}</Text>
                  <View className="flex-row items-center justify-between pt-2 border-t border-stone-100">
                    <View className="flex-row items-center flex-1 mr-2">
                      <View className={`w-2 h-2 rounded-full mr-1.5 ${status.open ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                      <Text
                        className={`text-xs font-inter-semibold ${status.open ? 'text-emerald-700' : 'text-stone-500'}`}
                        numberOfLines={1}
                      >
                        {status.label}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row mt-3" style={{ gap: 8 }}>
                    <StoreOrderButton
                      label="Pickup"
                      icon="bag-handle"
                      loading={going === `${item.id}:pickup`}
                      disabled={!!going}
                      onPress={() => handleGo('pickup', item.id)}
                    />
                    <StoreOrderButton
                      label="Delivery"
                      icon="bicycle"
                      loading={going === `${item.id}:delivery`}
                      disabled={!!going}
                      onPress={() => handleGo('delivery', item.id)}
                    />
                  </View>
                </View>
              );
            })
          )}
        </View>
      </Animated.ScrollView>

      {/* Change store / order type / delivery address */}
      <OrderTypeSheet visible={sheetVisible} onClose={handleSheetClose} fallbackLocationId={selectedStoreId} />
    </View>
  );
}

const styles = StyleSheet.create({
  storeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#A61C14',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  storeButtonLit: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#A61C14',
  },
  storeButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    marginLeft: 6,
  },
  photoChip: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    maxWidth: SCREEN.width - 24,
  },
  headline: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  bigButton: {
    height: 66,
    borderRadius: 20,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  bigButtonIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  bigButtonTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 20,
    letterSpacing: -0.2,
  },
  bigButtonSub: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    marginTop: 1,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 5,
  },
  extras: {
    marginTop: -24,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: '#FAF6F0',
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  liveDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
  },
});
