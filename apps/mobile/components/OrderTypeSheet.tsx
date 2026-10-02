import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet, Keyboard, ActivityIndicator, Dimensions } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import { useLocationStore } from '../store/locationStore';
import { useLocations } from '../hooks/useLocations';
import { useStoreRush } from '../hooks/useStoreRush';
import { useCartBarSpace } from '../hooks/useCartBarSpace';
import { storeStatus } from '../lib/hours';
import { canOrderAsap, estimateReadyMinutes } from '../lib/orderTiming';
import { switchStore } from '../lib/storeSwitch';
import AddressAutocomplete from './AddressAutocomplete';
import SavedAddressChips from './SavedAddressChips';

type Props = {
  visible: boolean;
  onClose: () => void;
  // Called after the customer switches store here (the menu uses it to
  // show the new store's menu).
  onStoreChanged?: (locationId: string) => void;
  // The store to show as selected when neither the cart nor the menu has
  // one yet -- Home's pre-picked (e.g. nearest) store.
  fallbackLocationId?: string | null;
};

const RED = '#A61C14';
const SCREEN_HEIGHT = Dimensions.get('window').height;

// Pickup / Delivery + store + delivery address, as a bottom sheet over the
// current screen. Shared by the menu's order-type pill, the cart and Home.
// Render it last inside a full-screen View -- it's an absolute overlay.
//
// It slides up (and back down) rather than popping in; the Pickup/Delivery
// switch slides between the two; the address field fades in as the sheet
// grows to fit it. A registered customer's saved address is fetched when
// the sheet opens, so choosing Delivery fills it in at once.
export default function OrderTypeSheet({ visible, onClose, onStoreChanged, fallbackLocationId }: Props) {
  const orderType = useCartStore((state) => state.orderType);
  const setOrderType = useCartStore((state) => state.setOrderType);
  const deliveryAddress = useCartStore((state) => state.deliveryAddress);
  const setDeliveryAddress = useCartStore((state) => state.setDeliveryAddress);
  const itemCount = useCartStore((state) => state.items.reduce((sum, item) => sum + item.quantity, 0));
  const cartLocationId = useCartStore((state) => (state.items.length > 0 ? state.locationId : null));
  const browsingLocationId = useLocationStore((state) => state.locationId);
  const currentLocationId = cartLocationId ?? browsingLocationId ?? fallbackLocationId ?? null;
  const { data: locations } = useLocations();
  const session = useAuthStore((state) => state.session);
  const isAnonymous = session?.user?.is_anonymous ?? false;
  const rushMinutes = useStoreRush(visible ? currentLocationId : null);
  // The cart's own screen has no floating View Cart bar to keep clear of.
  const pathname = usePathname();
  const cartBarSpace = useCartBarSpace();
  const bottomSpace = pathname.endsWith('/cart') ? 0 : cartBarSpace;

  // ---- Open / close ------------------------------------------------------
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
    } else if (mounted) {
      Keyboard.dismiss();
      progress.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic) }, (done) => {
        if (done) runOnJS(setMounted)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * SCREEN_HEIGHT * 0.6 }],
  }));

  // ---- Keyboard: the sheet rises above it while an address is typed -------
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // ---- The saved address, fetched as the sheet opens ----------------------
  const [savedAddress, setSavedAddress] = useState<string | null>(null);
  useEffect(() => {
    if (!visible || isAnonymous || !session?.user?.id || savedAddress !== null) return;
    (supabase as any)
      .from('profiles')
      .select('address')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }: any) => setSavedAddress(data?.address ?? ''))
      .catch(() => {});
  }, [visible, isAnonymous, session?.user?.id, savedAddress]);

  // Chose Delivery before it arrived: fill it in once it does.
  useEffect(() => {
    if (orderType === 'delivery' && !deliveryAddress && savedAddress) setDeliveryAddress(savedAddress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedAddress]);

  // ---- Pickup / Delivery switch -------------------------------------------
  const [switchWidth, setSwitchWidth] = useState(0);
  const slide = useSharedValue(orderType === 'delivery' ? 1 : 0);
  useEffect(() => {
    slide.value = withTiming(orderType === 'delivery' ? 1 : 0, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [orderType, slide]);
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slide.value * ((switchWidth - 8) / 2) }],
  }));

  const choose = (type: 'pickup' | 'delivery') => {
    if (type === orderType) return;
    Haptics.selectionAsync().catch(() => {});
    setOrderType(type);
    if (type === 'delivery' && !deliveryAddress && savedAddress) setDeliveryAddress(savedAddress);
  };

  // ---- Store --------------------------------------------------------------
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const handleSelectStore = async (loc: any) => {
    if (loc.id === currentLocationId || switchingTo) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSwitchingTo(loc.id);
    try {
      if (await switchStore(loc.id, loc.name)) onStoreChanged?.(loc.id);
    } finally {
      setSwitchingTo(null);
    }
  };

  // How long each would take from the selected store right now.
  const currentStore: any = locations?.find((l: any) => l.id === currentLocationId);
  const timeLine = (type: 'pickup' | 'delivery') => {
    const size = Math.max(itemCount, 1);
    if (currentStore && !canOrderAsap(currentStore.hours, type, size, rushMinutes)) return 'Order ahead';
    const minutes = estimateReadyMinutes(type, size, rushMinutes);
    return type === 'pickup' ? `Ready in ~${minutes} min` : `~${minutes} min to you`;
  };

  if (!mounted) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>

      <Animated.View style={[styles.sheetWrap, { marginBottom: keyboardHeight }, sheetStyle]}>
        {/* Its own layer for the height change -- a layout animation and the
            slide's transform on one view would fight. */}
        <Animated.View
          layout={LinearTransition.duration(220)}
          className="bg-[#FAF6F0] rounded-t-3xl px-5 pt-3"
          style={{ paddingBottom: 24 + (keyboardHeight ? 0 : bottomSpace) }}
        >
          <View className="w-10 h-1 bg-stone-300 rounded-full self-center mb-3" />
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-xl font-display-bold text-[#1C1917]">How are you getting it?</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color="#1C1917" />
            </TouchableOpacity>
          </View>

          {/* Pickup / Delivery -- a white pill slides between the two */}
          <View
            className="flex-row bg-[#E7E5E4] rounded-2xl mb-5"
            style={{ padding: 4 }}
            onLayout={(e) => setSwitchWidth(e.nativeEvent.layout.width)}
          >
            {switchWidth > 0 && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.indicator,
                  { width: (switchWidth - 8) / 2 },
                  indicatorStyle,
                ]}
              />
            )}
            {(['pickup', 'delivery'] as const).map((type) => {
              const active = orderType === type;
              return (
                <Pressable
                  key={type}
                  onPress={() => choose(type)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  style={styles.segment}
                >
                  <View className="flex-row items-center">
                    <Ionicons
                      name={type === 'pickup' ? 'storefront' : 'car'}
                      size={17}
                      color={active ? RED : '#78716C'}
                    />
                    <Text
                      className="font-inter-bold text-[15px] ml-1.5"
                      style={{ color: active ? RED : '#78716C' }}
                    >
                      {type === 'pickup' ? 'Pickup' : 'Delivery'}
                    </Text>
                  </View>
                  <Text className="text-xs font-inter-medium mt-0.5" style={{ color: active ? '#57534E' : '#A8A29E' }}>
                    {timeLine(type)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {!!locations?.length && (
            <View className="mb-4">
              <Text className="text-xs font-inter-bold uppercase tracking-wider text-stone-500 mb-2">
                {orderType === 'delivery' ? 'Delivering from' : 'Pickup from'}
              </Text>
              {locations.map((loc: any) => {
                const selected = loc.id === currentLocationId;
                // Same wording as Home: "Open until 4PM", "Opens tomorrow at 11AM".
                const status = storeStatus(loc.hours);
                const open = status.open;
                return (
                  <TouchableOpacity
                    key={loc.id}
                    onPress={() => handleSelectStore(loc)}
                    disabled={!!switchingTo}
                    activeOpacity={0.8}
                    style={[styles.store, { borderColor: selected ? RED : '#E7E5E4' }]}
                  >
                    <View className="flex-1 mr-2">
                      <Text className="text-[15px] font-inter-bold text-[#1C1917]">{loc.name}</Text>
                      {!!loc.address && (
                        <Text className="text-xs text-stone-500" numberOfLines={1}>
                          {loc.address}
                        </Text>
                      )}
                      <View className="flex-row items-center mt-0.5">
                        <View
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 3,
                            marginRight: 4,
                            backgroundColor: open ? '#10B981' : '#D6D3D1',
                          }}
                        />
                        <Text className="text-xs font-inter-semibold" style={{ color: open ? '#047857' : '#78716C' }}>
                          {status.label || (open ? 'Open' : 'Closed')}
                        </Text>
                      </View>
                    </View>
                    {switchingTo === loc.id ? (
                      <ActivityIndicator size="small" color={RED} />
                    ) : (
                      <View style={[styles.radio, { borderColor: selected ? RED : '#D6D3D1' }]}>
                        {selected && <View style={styles.radioDot} />}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {orderType === 'delivery' && (
            <Animated.View entering={FadeIn.duration(200).delay(60)} exiting={FadeOut.duration(120)} className="mb-4">
              <Text className="text-xs font-inter-bold uppercase tracking-wider text-stone-500 mb-2">Delivering to</Text>
              <AddressAutocomplete defaultAddress={deliveryAddress} onAddressSelect={setDeliveryAddress} />
              {/* Home / Work in one tap, and saving a new one as either */}
              <View className="mt-2.5">
                <SavedAddressChips current={deliveryAddress} onPick={setDeliveryAddress} offerSave />
              </View>
            </Animated.View>
          )}

          <TouchableOpacity onPress={onClose} activeOpacity={0.85} style={styles.done}>
            <Text className="text-[#F4ECE1] font-inter-bold text-base">Done</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  indicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  store: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: RED,
  },
  done: {
    backgroundColor: RED,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
});
