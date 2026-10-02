import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Keyboard, Image } from 'react-native';
import { Alert } from '../../lib/alert';
import { useRouter, useFocusEffect } from 'expo-router';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { useCartStore } from '../../store/cartStore';
import { useLocationStore } from '../../store/locationStore';
import { useAuthStore } from '../../store/authStore';
import { usePromoStore } from '../../store/promoStore';
import { useBackHandler } from '../../hooks/useBackHandler';
import { useLocationDetails } from '../../hooks/useLocationDetails';
import { appliedPromoFromRow, hasCategoryScope, hasUserRedeemedCode, resolvePromoCategoryIds } from '../../lib/promoEligibility';
import NotifyPreferenceToggle from '../../components/NotifyPreferenceToggle';
import CountryPickerSheet from '../../components/CountryPickerSheet';
import TimeSlotPickerSheet from '../../components/TimeSlotPickerSheet';
import OrderTypeSheet from '../../components/OrderTypeSheet';
import SavedAddressChips from '../../components/SavedAddressChips';
import CartUpsellTray from '../../components/CartUpsellTray';
import CartLine from '../../components/CartLine';
import { redeemReferralCode } from '../../lib/referrals';
import { useStoreRush } from '../../hooks/useStoreRush';
import AvailableDeals from '../../components/AvailableDeals';
import PromoCoupon from '../../components/PromoCoupon';
import AccountSetupSheet from '../../components/AccountSetupSheet';
import { needsOrderDetails } from '../../lib/account';
import { welcomeNewAccount } from '../../lib/guestSession';
import { isValidEmail } from '../../lib/passwordStrength';
import {
  canOrderAsap,
  estimateReadyMinutes,
  formatDayAndTime,
  getOrderDays,
  isOrderTimeAvailable,
} from '../../lib/orderTiming';
import {
  CATERING_MAX_DELIVERY_KM,
  CATERING_MIN_SUBTOTAL,
  CATERING_RULES_SUMMARY,
  getCateringDays,
  isCateringSlotAllowed,
} from '../../lib/catering';
import { distanceKm } from '../../lib/geo';
import { Country, DEFAULT_COUNTRY, formatPhoneNumber, isValidPhoneForCountry, parsePhone } from '../../lib/countries';
import { tabularNums } from '../../lib/typography';
import { pointsForSubtotal, pointsProgressLabel } from '../../lib/points';
import { useProfile } from '../../hooks/useProfile';
import { useCartTotals, fetchMenuItemInfo, menuItemInfoKey } from '../../hooks/useCartTotals';

const hapticSuccess = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
const hapticError = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});

export default function CartScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { items, locationId, removeItem, updateItemQuantity, clearCart, orderType, deliveryAddress } = useCartStore();
  const setDeliveryAddress = useCartStore((state) => state.setDeliveryAddress);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { session } = useAuthStore();
  // Verifying their email at checkout turns a guest's session into a real
  // (password-less) account, which would make the guest form vanish half-way
  // through checkout -- so a guest who verified here stays on the guest form
  // until this order is placed. Otherwise it follows the live session: the
  // cart stays mounted (it's a tab), and a guest who creates an account
  // elsewhere (More / Profile) must see the normal member checkout.
  const [verifiedAtCheckout, setVerifiedAtCheckout] = useState(false);
  const [accountSetupVisible, setAccountSetupVisible] = useState(false);
  const [detailsSheetVisible, setDetailsSheetVisible] = useState(false);
  const isAnonymous = (session?.user?.is_anonymous ?? false) || verifiedAtCheckout;
  // A different person signed in (sign out, then in) -- start fresh.
  useEffect(() => {
    setVerifiedAtCheckout(false);
  }, [session?.user?.id]);

  const [guestFirstName, setGuestFirstName] = useState('');
  const [guestLastName, setGuestLastName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestCountry, setGuestCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);

  const [guestEmail, setGuestEmail] = useState(() => session?.user?.email ?? '');
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifySms, setNotifySms] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(() => session?.user?.email ?? null);
  const emailVerified = !!verifiedEmail && verifiedEmail === guestEmail.trim();

  const [selectedSlot, setSelectedSlot] = useState<Date | null>(null);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [applyingPromo, setApplyingPromo] = useState(false);
  const [promoInputOpen, setPromoInputOpen] = useState(false);
  const { appliedPromo, setAppliedPromo } = usePromoStore();
  const [cateringCompany, setCateringCompany] = useState('');
  const [cateringPo, setCateringPo] = useState('');
  const [invoiceEmail, setInvoiceEmail] = useState('');
  const [cateringSuite, setCateringSuite] = useState('');
  const [cateringDropoff, setCateringDropoff] = useState('');

  // Subtotal, promo discount, tax and total -- shared with the floating
  // View Cart bar so the two always agree (hooks/useCartTotals.ts).
  const {
    subtotal: cartTotal,
    discount: discountAmount,
    discountedSubtotal,
    tax: taxAmount,
    total: grandTotal,
    unmetReason: promoUnmetReason,
  } = useCartTotals();
  // Free reward items (wheel prizes, points rewards, the birthday treat):
  // each is its own line, listed by what it is ("Free Signature Sandwich")
  // with its own remove -- however many are in the cart.
  const rewardLines = items.filter((item) => !!item.promoCode);
  const rewardCodes = Array.from(new Set(rewardLines.map((item) => item.promoCode!))).sort();
  const { data: rewardTitles } = useQuery({
    queryKey: ['rewardTitles', rewardCodes.join(',')],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('promotions').select('code, title').in('code', rewardCodes);
      if (error) throw error;
      return new Map<string, string>((data || []).map((p: any) => [p.code, p.title]));
    },
    enabled: rewardCodes.length > 0,
    staleTime: Infinity,
  });

  const browsingLocationId = useLocationStore(state => state.locationId);
  const goBack = useCallback(() => {
    const backLocationId = browsingLocationId ?? locationId;
    router.replace(backLocationId ? `/(main)/menu/${backLocationId}` : '/(main)');
  }, [browsingLocationId, locationId, router]);
  useBackHandler(goBack);

  const { data: locationDetails } = useLocationDetails(locationId);
  const locationName = locationDetails?.name ?? null;
  const locationHours = locationDetails?.hours ?? null;


  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  // When the order can be ready: ASAP only while the store's open (and can
  // finish it before closing); otherwise a time when it's open -- today
  // later, or the next days it opens (lib/orderTiming). Re-read on every
  // visit to the cart, so the clock moving on is picked up.
  const [clockTick, setClockTick] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setClockTick((t) => t + 1);
    }, [])
  );
  // Extra minutes while the store's busy (hooks/useStoreRush) -- in every
  // time below.
  const rushMinutes = useStoreRush(locationId);
  const asapAvailable = useMemo(
    () => canOrderAsap(locationHours, orderType, itemCount, rushMinutes),
    [locationHours, orderType, itemCount, rushMinutes, clockTick]
  );
  const orderDays = useMemo(
    () => getOrderDays(locationHours, orderType, itemCount, rushMinutes),
    [locationHours, orderType, itemCount, rushMinutes, clockTick]
  );

  // Any catering package in the cart switches the whole order to catering
  // rules (see lib/catering.ts). Read straight off menu_items rather than a
  // flag stored on each cart line, so it holds however the item got here
  // (item screen, reorder, "Your Usual").
  const cartMenuItemIds = useMemo(() => Array.from(new Set(items.map((i) => i.menuItemId))).sort(), [items]);
  const { data: cateringItemIds } = useQuery({
    queryKey: ['cateringFlags', cartMenuItemIds],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('menu_items')
        .select('id')
        .in('id', cartMenuItemIds)
        .eq('is_catering', true);
      if (error) throw error;
      return new Set<string>((data || []).map((row: any) => row.id));
    },
    enabled: cartMenuItemIds.length > 0,
    // Adding a different item changes the key; without this the answer
    // would briefly be "unknown" (so, not catering) while it refetches,
    // which would wipe the catering date/time the customer already picked.
    placeholderData: keepPreviousData,
  });
  const isCateringOrder = !!cateringItemIds && items.some((i) => cateringItemIds.has(i.menuItemId));
  const cateringDays = useMemo(() => getCateringDays(locationHours), [locationHours, isCateringOrder]);
  // After discounts, before tax.
  const cateringShortfall = isCateringOrder ? Math.max(0, CATERING_MIN_SUBTOTAL - discountedSubtotal) : 0;
  // "This order earns 180 pts -- 120 more for a free drink", from the
  // customer's real balance (guests start at 0, and their points are kept
  // once they verify their email at checkout).
  const { data: profile } = useProfile();
  const pointsEarned = pointsForSubtotal(cartTotal);
  const pointsHint = pointsProgressLabel((profile?.panino_points ?? 0) + pointsEarned);

  // A regular order's slot depends on order size/type (the ASAP estimate),
  // so those changes reset it. A catering slot is a booked day and time --
  // adding another tray shouldn't throw it away -- so it only resets when
  // the order switches into or out of catering.
  useEffect(() => {
    if (!isCateringOrder) setSelectedSlot(null);
  }, [orderType, itemCount]);
  useEffect(() => {
    setSelectedSlot(null);
  }, [isCateringOrder]);
  // A different store has different hours, so a picked time can't carry over.
  useEffect(() => {
    setSelectedSlot(null);
  }, [locationId]);

  // Store closed (no ASAP): start them on the earliest time it's open, so
  // the cart never says "ASAP" for a closed store -- they can change it.
  // A time that's no longer possible (the clock moved past it) is dropped.
  useEffect(() => {
    if (isCateringOrder) return;
    if (selectedSlot && !isOrderTimeAvailable(selectedSlot, locationHours, orderType, itemCount, rushMinutes)) {
      setSelectedSlot(null);
      return;
    }
    if (!selectedSlot && !asapAvailable && orderDays[0]?.slots[0]) {
      setSelectedSlot(orderDays[0].slots[0].time);
    }
  }, [isCateringOrder, selectedSlot, asapAvailable, orderDays, locationHours, orderType, itemCount, rushMinutes]);

  // Why Place Order is greyed out, if it is -- shown on the button itself.
  // Below the catering minimum, Place Order isn't a dead end: tapping it
  // scrolls up to the minimum banner and its add-on suggestions.
  const shortfallBlocked = isCateringOrder && cateringShortfall > 0;
  const checkoutBlockedLabel = shortfallBlocked
    ? `Add $${cateringShortfall.toFixed(2)} more -- see options`
    : isAnonymous && !emailVerified
    ? 'Verify Email Above to Continue'
    : null;
  const scrollRef = useRef<ScrollView>(null);
  // One ID per checkout, sent with the order and reused if Place Order is
  // tapped again for the same cart -- after a dropped connection the order
  // may already be in, and the database hands that one back instead of
  // making it twice (the checkout_and_loyalty_upgrades migration). A
  // changed cart gets a new ID.
  const checkoutKey = useRef<{ key: string; cart: string } | null>(null);

  // The cart is a tab screen, so it stays mounted (and keeps its scroll
  // position) while the customer browses the menu -- start back at the top
  // every time it's opened instead.
  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, [])
  );
  const [orderTypeSheetVisible, setOrderTypeSheetVisible] = useState(false);
  const handleShortfallPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  // This location's catering packages, cheapest first -- for the "add
  // something to reach the minimum" suggestions.
  const { data: cateringMenu } = useQuery({
    queryKey: ['cateringMenu', locationId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('menu_items')
        .select('id, name, base_price, category_id, menu_categories(name)')
        .eq('location_id', locationId)
        .eq('is_catering', true)
        .eq('is_available', true)
        .order('base_price');
      if (error) throw error;
      return data as { id: string; name: string; base_price: number; category_id: string; menu_categories: { name: string } | null }[];
    },
    enabled: !!locationId && isCateringOrder,
  });
  // The cheapest package that closes the gap comes first (being $3 short
  // shouldn't lead with an $85 dessert box), then the ones closest to it.
  const shortfallSuggestions = useMemo(() => {
    if (!cateringMenu || cateringShortfall <= 0) return [];
    const covers = cateringMenu.filter((m) => Number(m.base_price) >= cateringShortfall);
    const under = cateringMenu.filter((m) => Number(m.base_price) < cateringShortfall).reverse();
    return [...covers, ...under].slice(0, 3);
  }, [cateringMenu, cateringShortfall]);

  // Catering delivery radius, checked as soon as a catering cart has a
  // delivery address rather than only at Place Order, so an out-of-range
  // address is flagged right under it. Cached per store + address; checkout
  // reuses the result. Fails open (null) when the lookup can't be done --
  // staff confirm every catering order by phone anyway.
  const storeLat = locationDetails?.latitude ?? null;
  const storeLng = locationDetails?.longitude ?? null;
  const [cateringDistance, setCateringDistance] = useState<{ key: string; km: number | null } | null>(null);
  const distanceKey = `${locationId}|${deliveryAddress}`;
  const checkDeliveryDistance = useCallback(
    async (address: string): Promise<number | null> => {
      if (storeLat == null || storeLng == null) return null;
      try {
        const [match] = await Location.geocodeAsync(address);
        return match ? distanceKm(storeLat, storeLng, match.latitude, match.longitude) : null;
      } catch (e: any) {
        console.warn('Catering distance check skipped:', e?.message);
        return null;
      }
    },
    [storeLat, storeLng]
  );
  useEffect(() => {
    if (!isCateringOrder || orderType !== 'delivery' || !deliveryAddress) return;
    if (storeLat == null || storeLng == null) return;
    if (cateringDistance?.key === distanceKey) return;
    let cancelled = false;
    checkDeliveryDistance(deliveryAddress).then((km) => {
      if (!cancelled) setCateringDistance({ key: distanceKey, km });
    });
    return () => {
      cancelled = true;
    };
  }, [isCateringOrder, orderType, distanceKey, checkDeliveryDistance]);
  const cateringDistanceKm =
    isCateringOrder && orderType === 'delivery' && cateringDistance?.key === distanceKey ? cateringDistance.km : null;
  const outOfCateringRange = cateringDistanceKm != null && cateringDistanceKm > CATERING_MAX_DELIVERY_KM;

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    setApplyingPromo(true);
    try {
      let { data: promo, error } = await (supabase as any)
        .from('promotions')
        .select('*')
        .ilike('code', promoCode.trim())
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      // Not a deal's code -- maybe a friend's (Give $5, Get $5), which gives
      // this customer their own $5-off deal to apply.
      if (!promo) promo = await redeemReferralCode(promoCode);
      if (!promo) {
        hapticError();
        Alert.alert('Invalid Code', "That promo code doesn't exist or is no longer active.");
        return;
      }

      if (promo.single_use !== false && session?.user?.id) {
        const alreadyRedeemed = await hasUserRedeemedCode(session.user.id, promo.code);
        if (alreadyRedeemed) {
          hapticError();
          Alert.alert('Already Used', "You've already redeemed this code before.");
          return;
        }
      }

      // Resolved up front here (rather than left to the effect above) so the
      // promo box shows its real state the moment the code is applied.
      const applied = appliedPromoFromRow(promo);
      if (locationId && hasCategoryScope(applied)) {
        queryClient.setQueryData(menuItemInfoKey(locationId), await fetchMenuItemInfo(locationId));
        applied.resolvedCategoryIds = await resolvePromoCategoryIds(applied, locationId);
        applied.resolvedForLocationId = locationId;
      }

      // Accepted even if the cart doesn't meet the deal's rules yet -- the
      // promo box then says exactly what's missing ("Add $4.50 more...")
      // and the discount kicks in on its own once it's met.
      setAppliedPromo(applied);
      hapticSuccess();
      setPromoCode('');
      setPromoInputOpen(false);
    } catch (e: any) {
      hapticError();
      Alert.alert("Couldn't apply code", e.message);
    } finally {
      setApplyingPromo(false);
    }
  };

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // A member's update preferences (More > Notifications), read each time the
  // cart opens so a change made there counts on the very next order.
  useFocusEffect(
    useCallback(() => {
      if (isAnonymous || !session?.user?.id) return;
      let active = true;
      (async () => {
        const { data, error } = await (supabase as any)
          .from('profiles')
          .select('notify_email, notify_sms')
          .eq('id', session.user.id)
          .single();
        if (active && !error && data) {
          setNotifyEmail(data.notify_email ?? true);
          setNotifySms(data.notify_sms ?? false);
        }
      })();
      return () => {
        active = false;
      };
    }, [session?.user?.id, isAnonymous])
  );

  useEffect(() => {
    if (!isAnonymous || !session?.user?.id) return;
    (async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('customer_name, customer_phone, notify_email, notify_sms')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return;

      const [firstName, ...rest] = (data.customer_name || '').trim().split(/\s+/);
      setGuestFirstName(firstName || '');
      setGuestLastName(rest.join(' '));
      setNotifyEmail(data.notify_email ?? true);
      setNotifySms(data.notify_sms ?? false);

      const { country: parsedCountry, digits } = parsePhone(data.customer_phone || '');
      setGuestCountry(parsedCountry);
      setGuestPhone(digits);
    })();
  }, [isAnonymous, session?.user?.id]);

  const handleSendCode = async () => {
    if (!isValidEmail(guestEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address first.');
      return;
    }
    setSendingOtp(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: guestEmail.trim() });
      if (error) throw error;
      setOtpSent(true);
      setOtpCode('');
    } catch (e: any) {
      Alert.alert("Couldn't send code", e.message);
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyCode = async () => {
    setVerifyingOtp(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: guestEmail.trim(),
        token: otpCode.trim(),
        type: 'email_change',
      });
      if (error) throw error;
      setVerifiedEmail(guestEmail.trim());
      setVerifiedAtCheckout(true);
      setOtpSent(false);
      setOtpCode('');
    } catch (e: any) {
      Alert.alert('Invalid Code', e.message);
    } finally {
      setVerifyingOtp(false);
    }
  };

  // acceptedTotal: set when the customer has just agreed to a new total
  // after prices changed (see the PRICE_CHANGED handling below).
  const handleCheckout = async (acceptedTotal?: number) => {
    if (!locationId || items.length === 0) return;

    if (orderType === 'delivery' && !deliveryAddress) {
      hapticError();
      Alert.alert('Missing Address', 'Please add a delivery address before checking out.');
      setOrderTypeSheetVisible(true);
      return;
    }

    // Checked again at the moment of ordering (the clock may have moved on
    // since the cart opened): no "ASAP" while the store's closed, and a
    // chosen time has to still be possible.
    if (!isCateringOrder) {
      if (selectedSlot && !isOrderTimeAvailable(selectedSlot, locationHours, orderType, itemCount, rushMinutes)) {
        hapticError();
        setSelectedSlot(null);
        Alert.alert('Time No Longer Available', 'That time has passed or the store is closed then. Please choose another time.');
        setTimePickerVisible(true);
        return;
      }
      if (!selectedSlot && !canOrderAsap(locationHours, orderType, itemCount, rushMinutes)) {
        hapticError();
        Alert.alert("We're Closed Right Now", 'Choose a time when the store is open to order ahead.');
        setTimePickerVisible(true);
        return;
      }
    }

    if (isCateringOrder) {
      if (cateringShortfall > 0) {
        hapticError();
        Alert.alert(
          'Catering Minimum',
          `Catering orders have a $${CATERING_MIN_SUBTOTAL} minimum. Add $${cateringShortfall.toFixed(2)} more to place this order.`
        );
        return;
      }
      if (!selectedSlot) {
        hapticError();
        Alert.alert('Choose a Date & Time', 'Pick when you need your catering order.');
        setTimePickerVisible(true);
        return;
      }
      // Re-checked here, not just when the time was picked -- a slot chosen
      // for tomorrow at 5:59 PM is no longer allowed once it's past 6 PM.
      if (!isCateringSlotAllowed(selectedSlot)) {
        hapticError();
        setSelectedSlot(null);
        Alert.alert(
          'Time No Longer Available',
          'Catering needs to be ordered by 6 PM the day before. Please choose another date or time.'
        );
        return;
      }
      if (orderType === 'delivery') {
        if (!cateringDropoff.trim()) {
          hapticError();
          Alert.alert('Drop-off Instructions', 'Tell us where to drop off your catering order (e.g. "Front reception, 3rd floor").');
          return;
        }
        // Delivery radius -- the result the Cart already worked out for this
        // address when there is one, otherwise looked up now.
        const km = cateringDistance?.key === distanceKey ? cateringDistance.km : await checkDeliveryDistance(deliveryAddress);
        if (km != null && km > CATERING_MAX_DELIVERY_KM) {
          hapticError();
          Alert.alert(
            'Outside Delivery Area',
            `We deliver catering up to ${CATERING_MAX_DELIVERY_KM} km from the store, and this address is about ${Math.round(km)} km away. You can switch to pickup instead.`
          );
          return;
        }
      }
    }

    if (isAnonymous && (!guestFirstName.trim() || !guestLastName.trim() || !guestPhone.trim() || !guestEmail.trim())) {
      hapticError();
      Alert.alert('Missing Details', 'Please enter your name, phone number, and email for the order.');
      return;
    }
    if (isAnonymous && !isValidEmail(guestEmail)) {
      hapticError();
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    if (isAnonymous && !isValidPhoneForCountry(guestPhone, guestCountry)) {
      hapticError();
      Alert.alert('Invalid Phone', `Please enter a valid phone number for ${guestCountry.name}.`);
      return;
    }
    if (isAnonymous && !emailVerified) {
      hapticError();
      Alert.alert('Verify Your Email', 'Please verify your email address before placing the order.');
      return;
    }
    if (isCateringOrder && invoiceEmail.trim() && !isValidEmail(invoiceEmail)) {
      hapticError();
      Alert.alert('Invalid Invoice Email', 'Please check the email address the invoice should go to, or leave it blank.');
      return;
    }
    if (!notifyEmail && !notifySms) {
      hapticError();
      Alert.alert('Notification Preference', 'Choose at least one way to receive order updates.');
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      let customerName = `${guestFirstName.trim()} ${guestLastName.trim()}`;
      let customerPhone = `+${guestCountry.dialCode}${guestPhone.trim()}`;

      if (!isAnonymous && user) {
        const { data: profile, error: profileError } = await (supabase as any)
          .from('profiles')
          .select('first_name, last_name, phone')
          .eq('id', user.id)
          .single();

        if (profileError) throw profileError;
        // Signed in with Apple or Google and not yet given a name or a phone
        // number: ask for them first, then carry on with the order.
        if (needsOrderDetails(user, profile)) {
          setDetailsSheetVisible(true);
          return;
        }
        customerName = `${profile.first_name} ${profile.last_name}`;
        customerPhone = profile.phone;
      }

      const cartSignature = JSON.stringify([
        locationId,
        orderType,
        selectedSlot?.toISOString() ?? null,
        appliedPromo?.code ?? null,
        items.map((i) => [i.menuItemId, i.quantity, i.modifiers.map((m) => m.optionId), i.specialInstructions ?? '', i.promoCode ?? '']),
      ]);
      if (!checkoutKey.current || checkoutKey.current.cart !== cartSignature) {
        checkoutKey.current = {
          key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`,
          cart: cartSignature,
        };
      }

      const estimatedReadyAt = (
        selectedSlot ?? new Date(Date.now() + estimateReadyMinutes(orderType, itemCount, rushMinutes) * 60000)
      ).toISOString();

      // One call saves the whole order -- items, options, and spending any
      // promo or reward codes -- or nothing at all (the place_order
      // migration). The database works out every price itself; the total
      // shown here is sent along so it can stop if they don't match.
      const { data: placed, error: placeError } = await (supabase as any).rpc('place_order', {
        p: {
          client_key: checkoutKey.current.key,
          location_id: locationId,
          order_type: orderType,
          delivery_address: orderType === 'delivery' ? deliveryAddress : null,
          requested_ready_at: selectedSlot ? selectedSlot.toISOString() : null,
          estimated_ready_at: estimatedReadyAt,
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_email: isAnonymous ? guestEmail.trim() : user?.email,
          notify_email: notifyEmail,
          notify_sms: notifySms,
          // Only a code that actually takes money off is sent (and so
          // recorded, and if single-use, spent) -- applying a deal whose
          // rules the cart doesn't meet mustn't burn it for $0. The
          // database re-checks the rules itself.
          promo_code: appliedPromo && discountAmount > 0 ? appliedPromo.code : null,
          catering_company: cateringCompany.trim() || null,
          po_number: cateringPo.trim() || null,
          invoice_email: invoiceEmail.trim() || null,
          catering_notes:
            [
              cateringSuite.trim() && `Floor/Suite: ${cateringSuite.trim()}`,
              cateringDropoff.trim() && `Drop-off: ${cateringDropoff.trim()}`,
            ]
              .filter(Boolean)
              .join('\n') || null,
          expected_total: Math.round((acceptedTotal ?? grandTotal) * 100) / 100,
          items: items.map((item) => ({
            menu_item_id: item.menuItemId,
            quantity: item.quantity,
            special_instructions: item.specialInstructions || null,
            reward_code: item.promoCode ?? null,
            option_ids: item.modifiers.map((m) => m.optionId),
          })),
        },
      });

      if (placeError) {
        // A price changed since these went in the cart: show the real total
        // and let the customer decide, instead of placing it silently.
        if (placeError.message === 'PRICE_CHANGED' && placeError.details) {
          const newTotal = Number(placeError.details);
          hapticError();
          Alert.alert(
            'Prices Updated',
            `Some prices changed since these items went in your cart. Your total is now $${newTotal.toFixed(2)} (it was $${grandTotal.toFixed(2)}).`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: `Place Order ($${newTotal.toFixed(2)})`, onPress: () => handleCheckout(newTotal) },
            ]
          );
          return;
        }
        throw placeError;
      }
      const orderData = { id: placed.order_id as string };
      checkoutKey.current = null;

      queryClient.invalidateQueries({ queryKey: ['promotions'] });
      queryClient.invalidateQueries({ queryKey: ['usedPromoCodes'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['wheelPromo'] });
      queryClient.invalidateQueries({ queryKey: ['usualOrder'] });
      queryClient.invalidateQueries({ queryKey: ['usualItem'] });
      queryClient.invalidateQueries({ queryKey: ['storeRush'] });

      // A guest's checkout details are the only name and phone their
      // account will have -- verifying their email just made it a real
      // (password-less) account with its own Profile tab -- so save them to
      // the profile instead of leaving it showing blanks. Only fills empty
      // fields, never overwrites, and isn't critical to the order itself.
      if (isAnonymous && user?.id) {
        const { error: profileError } = await (supabase as any)
          .from('profiles')
          .update({ first_name: guestFirstName.trim(), last_name: guestLastName.trim(), phone: customerPhone })
          .eq('id', user.id)
          .is('first_name', null);
        if (profileError) console.warn('Failed to save guest details to profile:', profileError.message);
      }

      clearCart();
      setVerifiedAtCheckout(false);
      setAppliedPromo(null);
      setSelectedSlot(null);
      setCateringCompany('');
      setCateringPo('');
      setInvoiceEmail('');
      setCateringSuite('');
      setCateringDropoff('');
      // Straight to the order, where it's celebrated (confetti, points) and
      // tracked live -- no popup in between.
      router.replace({ pathname: `/(main)/order/${orderData.id}`, params: { placed: '1' } });

    } catch (error: any) {
      hapticError();
      Alert.alert('Checkout Failed', error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-12">
      <View className="flex-row items-center justify-between px-4 mb-1">
        <View className="flex-row items-center flex-1">
          <TouchableOpacity
            onPress={goBack}
            className="py-2 pr-2 -ml-2"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={28} color="#A61C14" />
          </TouchableOpacity>
          <View>
            <Text className="text-2xl font-display-bold text-[#1C1917] tracking-tight">Your Cart</Text>
            {itemCount > 0 && (
              <Text className="text-xs font-inter-semibold text-stone-500 -mt-0.5">
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
                {locationName ? ` · ${locationName}` : ''}
              </Text>
            )}
          </View>
        </View>

        {items.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              Alert.alert('Clear Cart', 'Remove everything from your cart?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: clearCart },
              ]);
            }}
            disabled={isSubmitting}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Clear cart"
            className="px-3 py-1.5 rounded-full border border-stone-200 bg-white"
          >
            <Text className="text-stone-500 font-inter-semibold text-[13px]">Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* While the order is being placed, nothing in the cart can be changed
          (a Clear or a - / + mid-order would be lost or leave an empty cart
          if it fails). */}
      <ScrollView
        ref={scrollRef}
        pointerEvents={isSubmitting ? 'none' : 'auto'}
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: keyboardHeight + 20 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        // Keeps whatever section the customer is looking at in place when
        // something above it changes size -- e.g. adding a dip from the
        // upsell tray adds a cart line above the tray, which otherwise
        // shoved the tray down under their finger. Handled natively, before
        // the frame is drawn, so there's no visible jump. At the very top
        // it stays at the top.
        maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 8 }}
      >
        {items.length === 0 ? (
          <View className="items-center justify-center py-20">
            <View className="w-16 h-16 rounded-full bg-stone-200/60 items-center justify-center mb-3">
              <Ionicons name="bag-handle-outline" size={30} color="#78716C" />
            </View>
            <Text className="text-lg font-inter-bold text-[#1C1917]">Your cart is empty</Text>
            <Text className="text-sm text-stone-500 mt-1 mb-6">Looks like you haven't added any paninos yet.</Text>
            <TouchableOpacity
              onPress={goBack}
              className="bg-[#A61C14] px-6 py-3 rounded-xl active:bg-[#85140E]"
            >
              <Text className="text-[#F4ECE1] font-inter-bold text-base">Browse Menu</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Everything above the upsell tray in one block, so the tray
                is the section held in place when cart lines above it are
                added or removed (see maintainVisibleContentPosition). */}
            <View>
            {/* How and when */}
            <View className="mt-1 bg-white p-3.5 rounded-2xl border border-stone-200 shadow-sm">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center flex-1 mr-2">
                    <View className="w-9 h-9 rounded-full bg-[#FAF6F0] items-center justify-center mr-3 border border-stone-200">
                      <Ionicons name={orderType === 'delivery' ? 'car' : 'storefront'} size={18} color="#A61C14" />
                    </View>
                    <View className="flex-1">
                      {/* Tapping the order type opens the same Pickup / Delivery
                          sheet as the menu's pill. */}
                      <TouchableOpacity
                        onPress={() => setOrderTypeSheetVisible(true)}
                        className="flex-row items-center self-start"
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text className="text-xs font-inter-bold uppercase tracking-wider text-stone-500">
                          {orderType === 'delivery' ? 'Delivery' : `Pickup${locationName ? ` • ${locationName}` : ''}`}
                        </Text>
                        <Ionicons name="chevron-down" size={11} color="#78716C" style={{ marginLeft: 3 }} />
                      </TouchableOpacity>
                      <Text
                        className={`text-sm font-inter-bold ${isCateringOrder && !selectedSlot ? 'text-[#A61C14]' : 'text-[#1C1917]'}`}
                        numberOfLines={1}
                      >
                        {selectedSlot
                          ? `${orderType === 'delivery' ? 'Arriving' : 'Ready'} ${formatDayAndTime(selectedSlot)}`
                          : isCateringOrder
                          ? 'Choose a date & time'
                          : asapAvailable
                          ? `ASAP (~${estimateReadyMinutes(orderType, itemCount, rushMinutes)} min)`
                          : 'Closed -- choose a time'}
                      </Text>
                      {!isCateringOrder && !asapAvailable && (
                        <Text className="text-[13px] font-inter-semibold text-amber-700 mt-0.5" numberOfLines={1}>
                          We're closed now -- ordering ahead
                        </Text>
                      )}
                      {!isCateringOrder && asapAvailable && !selectedSlot && rushMinutes > 0 && (
                        <Text className="text-[13px] font-inter-semibold text-amber-700 mt-0.5" numberOfLines={1}>
                          Busy right now -- we've allowed a little extra time
                        </Text>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => setTimePickerVisible(true)}
                    className="bg-[#FAF6F0] px-3 py-1.5 rounded-xl border border-stone-200"
                  >
                    <Text className="text-[13px] font-inter-bold text-[#A61C14]">{isCateringOrder && !selectedSlot ? 'Choose' : 'Change'}</Text>
                  </TouchableOpacity>
                </View>
                {orderType === 'delivery' && (
                  <View className="mt-2.5 pt-2.5 border-t border-stone-100">
                    <TouchableOpacity onPress={() => setOrderTypeSheetVisible(true)} activeOpacity={0.7}>
                      <View className="flex-row items-center justify-between mb-0.5">
                        <Text className="text-xs font-inter-bold uppercase tracking-wider text-stone-500">
                          Delivering To
                        </Text>
                        <Text className="text-[13px] font-inter-bold text-[#A61C14]">{deliveryAddress ? 'Change' : 'Add'}</Text>
                      </View>
                      <Text className={`text-sm font-inter-semibold ${deliveryAddress ? 'text-[#1C1917]' : 'text-[#A61C14]'}`}>
                        {deliveryAddress || 'Tap to add your delivery address'}
                      </Text>
                    </TouchableOpacity>
                    {/* Saved Home / Work: switch with one tap */}
                    <View className="mt-2">
                      <SavedAddressChips current={deliveryAddress} onPick={setDeliveryAddress} />
                    </View>
                    {outOfCateringRange && (
                      <View className="flex-row items-start mt-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                        <Ionicons name="warning-outline" size={13} color="#B45309" style={{ marginTop: 1 }} />
                        <Text className="text-amber-800 text-[13px] font-inter-semibold ml-1.5 flex-1">
                          About {Math.round(cateringDistanceKm!)} km away -- catering delivery is up to {CATERING_MAX_DELIVERY_KM} km.
                          Switch to pickup, or use a closer address.
                        </Text>
                      </View>
                    )}
                  </View>
                )}
            </View>

            {isCateringOrder && (
              <View className="mt-3 p-4 bg-white rounded-2xl border border-[#A61C14] shadow-sm">
                <View className="flex-row items-center mb-1">
                  <Ionicons name="people" size={16} color="#A61C14" />
                  <Text className="text-[#A61C14] font-inter-extrabold text-[13px] uppercase tracking-wider ml-1.5">
                    Catering Order
                  </Text>
                </View>
                <Text className="text-[#1C1917] text-sm">{CATERING_RULES_SUMMARY}</Text>
                <Text className="text-[#78716C] text-[13px] mt-1">
                  We'll call you to confirm before we start preparing it.
                </Text>
                {cateringShortfall > 0 && (
                  <>
                    <View className="flex-row items-center mt-2 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      <Ionicons name="lock-closed" size={12} color="#B45309" />
                      <Text className="text-amber-800 text-[13px] font-inter-semibold ml-1.5 flex-1">
                        Add ${cateringShortfall.toFixed(2)} more to reach the ${CATERING_MIN_SUBTOTAL} catering minimum.
                      </Text>
                    </View>
                    {shortfallSuggestions.length > 0 && (
                      <View className="mt-2.5">
                        <Text className="text-xs font-inter-bold uppercase tracking-wider text-stone-500 mb-1.5">
                          Add to your order
                        </Text>
                        <View className="flex-row flex-wrap">
                          {shortfallSuggestions.map((m) => (
                            <TouchableOpacity
                              key={m.id}
                              onPress={() => router.push({ pathname: `/(main)/item/${m.id}`, params: { returnTo: 'cart' } })}
                              className="flex-row items-center bg-[#FAF6F0] border border-stone-300 rounded-full px-3 py-1.5 mr-2 mb-2"
                            >
                              <Ionicons name="add" size={13} color="#A61C14" />
                              <Text className="text-[#1C1917] text-[13px] font-inter-semibold ml-1">
                                {m.name} <Text style={tabularNums}>${Number(m.base_price).toFixed(2)}</Text>
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <TouchableOpacity
                          onPress={() =>
                            router.push({
                              pathname: '/(main)/menu-category',
                              params: {
                                categoryId: shortfallSuggestions[0].category_id,
                                categoryName: shortfallSuggestions[0].menu_categories?.name ?? 'Catering & Platters',
                                locationId: locationId ?? '',
                              },
                            })
                          }
                          className="flex-row items-center self-start"
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text className="text-[#A61C14] text-[13px] font-inter-bold">Browse all catering</Text>
                          <Ionicons name="chevron-forward" size={12} color="#A61C14" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                )}
              </View>
            )}

            {/* The order: every line in one card */}
            <Text className="text-xs font-inter-bold uppercase tracking-wider text-stone-500 mt-5 mb-2 px-1">
              Your Order
            </Text>
            <View className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
              {items.map((item, index) => (
                <CartLine
                  key={item.cartItemId}
                  item={item}
                  rewardTitle={item.promoCode ? rewardTitles?.get(item.promoCode) ?? null : null}
                  // A regular item in a catering cart goes out with the
                  // catering order, not now -- said on the line itself so
                  // nobody expects it for lunch today.
                  note={
                    isCateringOrder && !cateringItemIds?.has(item.menuItemId)
                      ? selectedSlot
                        ? `Comes with your catering ${orderType === 'delivery' ? 'delivery' : 'pickup'}, ${formatDayAndTime(selectedSlot)}`
                        : 'Comes with your catering order'
                      : null
                  }
                  onChangeQuantity={(quantity) => updateItemQuantity(item.cartItemId, quantity)}
                />
              ))}
              <TouchableOpacity onPress={goBack} activeOpacity={0.7} className="flex-row items-center px-3.5 py-3">
                <View className="w-7 h-7 rounded-full bg-[#FAF6F0] border border-stone-200 items-center justify-center mr-2.5">
                  <Ionicons name="add" size={16} color="#A61C14" />
                </View>
                <Text className="text-[#A61C14] font-inter-bold text-sm">Add more items</Text>
              </TouchableOpacity>
            </View>

            </View>

            {/* Sauce/meal/dessert upsells are for individual orders -- not
                shown on a catering order. */}
            {locationId && !isCateringOrder && (
              <CartUpsellTray items={items} locationId={locationId} cartTotal={cartTotal} />
            )}

            <Text className="text-xs font-inter-bold uppercase tracking-wider text-stone-500 mt-5 mb-2 px-1">
              Savings
            </Text>
            <View className="p-3.5 bg-white rounded-2xl border border-stone-200 shadow-sm">
              {appliedPromo ? (
                <PromoCoupon
                  promo={appliedPromo}
                  code={appliedPromo.code}
                  saved={discountAmount}
                  unmetReason={promoUnmetReason}
                  paidSubtotal={items.filter((i) => !i.promoCode).reduce((sum, i) => sum + i.totalPrice, 0)}
                  onRemove={() => setAppliedPromo(null)}
                />
              ) : !promoInputOpen ? (
                <TouchableOpacity
                  onPress={() => setPromoInputOpen(true)}
                  className="flex-row items-center justify-between"
                >
                  <View className="flex-row items-center">
                    <Ionicons name="pricetag-outline" size={16} color="#A61C14" />
                    <Text className="text-sm font-inter-semibold text-stone-700 ml-2">
                      Add Promo or Reward Code
                    </Text>
                  </View>
                  <Ionicons name="chevron-down" size={16} color="#A8A29E" />
                </TouchableOpacity>
              ) : (
                <View>
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-[13px] font-inter-bold text-stone-500 uppercase">Promo Code</Text>
                    <TouchableOpacity onPress={() => setPromoInputOpen(false)}>
                      <Text className="text-[13px] text-stone-400 font-inter-medium">Cancel</Text>
                    </TouchableOpacity>
                  </View>
                  <View className="flex-row">
                    <TextInput
                      className="bg-[#FAF6F0] border border-stone-300 px-3 py-2 rounded-xl flex-1 mr-2 text-sm text-[#1C1917]"
                      placeholder="Enter promo code"
                      placeholderTextColor="#A8A29E"
                      autoCapitalize="characters"
                      value={promoCode}
                      onChangeText={setPromoCode}
                    />
                    <TouchableOpacity
                      onPress={handleApplyPromo}
                      disabled={applyingPromo || !promoCode.trim()}
                      className={`px-4 rounded-xl items-center justify-center ${
                        applyingPromo || !promoCode.trim() ? 'bg-stone-300' : 'bg-[#1C1917]'
                      }`}
                    >
                      {applyingPromo ? (
                        <ActivityIndicator size="small" color="#F4ECE1" />
                      ) : (
                        <Text className={`text-[13px] font-inter-bold ${!promoCode.trim() ? 'text-stone-500' : 'text-[#F4ECE1]'}`}>Apply</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              {locationId && <AvailableDeals locationId={locationId} />}
            </View>

            {isCateringOrder && (
              <View className="mt-4 p-4 bg-white rounded-2xl border border-stone-200 shadow-sm">
                <Text className="text-base font-inter-bold text-[#1C1917] mb-3">Catering Details</Text>
                <TextInput
                  className="bg-[#FAF6F0] border border-stone-300 px-3 py-2.5 rounded-xl text-sm text-[#1C1917]"
                  placeholder="Company or event name (optional)"
                  placeholderTextColor="#A8A29E"
                  value={cateringCompany}
                  onChangeText={setCateringCompany}
                />
                <TextInput
                  className="bg-[#FAF6F0] border border-stone-300 px-3 py-2.5 rounded-xl text-sm text-[#1C1917] mt-2.5"
                  placeholder="PO / cost centre number (optional)"
                  placeholderTextColor="#A8A29E"
                  value={cateringPo}
                  onChangeText={setCateringPo}
                />
                <TextInput
                  className="bg-[#FAF6F0] border border-stone-300 px-3 py-2.5 rounded-xl text-sm text-[#1C1917] mt-2.5"
                  placeholder="Send invoice to, e.g. accounts@company.com (optional)"
                  placeholderTextColor="#A8A29E"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={invoiceEmail}
                  onChangeText={setInvoiceEmail}
                />
                <Text className="text-xs text-[#78716C] mt-1.5">
                  These go on your invoice -- email or save it as a PDF from the order screen.
                </Text>
                {orderType === 'delivery' && (
                  <>
                    <TextInput
                      className="bg-[#FAF6F0] border border-stone-300 px-3 py-2.5 rounded-xl text-sm text-[#1C1917] mt-2.5"
                      placeholder="Floor / suite / unit (optional)"
                      placeholderTextColor="#A8A29E"
                      value={cateringSuite}
                      onChangeText={setCateringSuite}
                    />
                    <TextInput
                      className="bg-[#FAF6F0] border border-stone-300 px-3 py-2.5 rounded-xl text-sm text-[#1C1917] mt-2.5"
                      style={{ minHeight: 64 }}
                      placeholder='Drop-off instructions (e.g. "Front reception, 3rd floor")'
                      placeholderTextColor="#A8A29E"
                      value={cateringDropoff}
                      onChangeText={setCateringDropoff}
                      multiline
                      textAlignVertical="top"
                    />
                    <Text className="text-xs text-[#78716C] mt-1.5">
                      Catering delivery is available up to {CATERING_MAX_DELIVERY_KM} km from the store.
                    </Text>
                  </>
                )}
              </View>
            )}

            {isAnonymous && (
              <View className="mt-4 p-4 bg-white rounded-2xl border border-stone-200 shadow-sm">
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-base font-inter-bold text-[#1C1917]">Contact & Pickup Info</Text>
                  <View className="bg-stone-100 px-2 py-0.5 rounded-full">
                    <Text className="text-[11px] font-inter-bold text-stone-500">GUEST CHECKOUT</Text>
                  </View>
                </View>

                <View className="flex-row justify-between mb-2.5">
                  <TextInput
                    className="bg-[#FAF6F0] border border-stone-300 px-3 py-2.5 rounded-xl flex-1 mr-1.5 text-sm text-[#1C1917]"
                    placeholder="First Name"
                    placeholderTextColor="#A8A29E"
                    value={guestFirstName}
                    onChangeText={setGuestFirstName}
                  />
                  <TextInput
                    className="bg-[#FAF6F0] border border-stone-300 px-3 py-2.5 rounded-xl flex-1 ml-1.5 text-sm text-[#1C1917]"
                    placeholder="Last Name"
                    placeholderTextColor="#A8A29E"
                    value={guestLastName}
                    onChangeText={setGuestLastName}
                  />
                </View>

                <View className="flex-row mb-2.5">
                  <TouchableOpacity
                    onPress={() => setCountryPickerVisible(true)}
                    className="flex-row items-center bg-[#FAF6F0] border border-stone-300 rounded-xl px-2.5 mr-2"
                  >
                    <Text className="text-sm mr-1">{guestCountry.flag}</Text>
                    <Text className="text-[13px] font-inter-semibold text-[#1C1917] mr-1">+{guestCountry.dialCode}</Text>
                    <Ionicons name="chevron-down" size={12} color="#A8A29E" />
                  </TouchableOpacity>
                  <TextInput
                    className="bg-[#FAF6F0] border border-stone-300 px-3 py-2.5 rounded-xl flex-1 text-sm text-[#1C1917]"
                    placeholder="Phone Number"
                    placeholderTextColor="#A8A29E"
                    keyboardType="phone-pad"
                    value={formatPhoneNumber(guestPhone, guestCountry)}
                    onChangeText={(text) => setGuestPhone(text.replace(/[^0-9]/g, ''))}
                  />
                </View>

                <TextInput
                  className="bg-[#FAF6F0] border border-stone-300 px-3 py-2.5 rounded-xl text-sm text-[#1C1917]"
                  placeholder="Email address"
                  placeholderTextColor="#A8A29E"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={guestEmail}
                  onChangeText={setGuestEmail}
                />

                {emailVerified ? (
                  <View className="flex-row items-center mt-2.5 px-1">
                    <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                    <Text className="text-green-700 font-inter-semibold text-[13px] ml-1.5">Email verified</Text>
                  </View>
                ) : otpSent ? (
                  <View className="mt-2.5 bg-stone-50 p-3 rounded-xl border border-stone-200">
                    <Text className="text-stone-600 text-[13px] mb-2">
                      Enter the 6-digit code we emailed to {guestEmail.trim()}.
                    </Text>
                    <View className="flex-row items-center">
                      <TextInput
                        className="bg-white border border-stone-300 px-3 py-2 rounded-lg text-sm text-[#1C1917] flex-1 mr-2 tracking-widest text-center font-inter-bold"
                        placeholder="000000"
                        placeholderTextColor="#A8A29E"
                        keyboardType="number-pad"
                        maxLength={6}
                        value={otpCode}
                        onChangeText={setOtpCode}
                      />
                      <TouchableOpacity
                        onPress={handleVerifyCode}
                        disabled={verifyingOtp || otpCode.trim().length !== 6}
                        className={`py-2 px-4 rounded-lg items-center ${
                          verifyingOtp || otpCode.trim().length !== 6 ? 'bg-stone-300' : 'bg-[#1C1917]'
                        }`}
                      >
                        {verifyingOtp ? (
                          <ActivityIndicator size="small" color="#F4ECE1" />
                        ) : (
                          <Text className="text-[#F4ECE1] font-inter-bold text-[13px]">Verify</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={handleSendCode} disabled={sendingOtp} className="mt-2 self-start">
                      <Text className="text-[#A61C14] font-inter-semibold text-[13px]">Resend Code</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={handleSendCode}
                    disabled={sendingOtp}
                    className="bg-[#1C1917] py-3.5 rounded-xl items-center justify-center mt-2.5 active:bg-stone-800"
                  >
                    {sendingOtp ? (
                      <ActivityIndicator size="small" color="#F4ECE1" />
                    ) : (
                      <Text className="text-[#F4ECE1] font-inter-bold text-sm">Verify Email to Continue</Text>
                    )}
                  </TouchableOpacity>
                )}
                {/* Same offer as the More tab's guest card: an account keeps
                    this cart and unlocks the welcome spin and PaninoPoints.
                    Hidden once they've verified here (they're then already a
                    password-less account). */}
                {!!session?.user?.is_anonymous && !emailVerified && (
                  <TouchableOpacity
                    onPress={() => setAccountSetupVisible(true)}
                    className="bg-[#A61C14] py-3.5 rounded-xl flex-row items-center justify-center mt-2.5 active:bg-[#85140E]"
                  >
                    <Ionicons name="sparkles" size={15} color="#F4ECE1" />
                    <Text className="text-[#F4ECE1] font-inter-bold text-sm ml-1.5">Create a Free Account</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {isAnonymous && (
              <NotifyPreferenceToggle
                notifyEmail={notifyEmail}
                notifySms={notifySms}
                onChangeEmail={setNotifyEmail}
                onChangeSms={setNotifySms}
              />
            )}

            {/* What it comes to */}
            <Text className="text-xs font-inter-bold uppercase tracking-wider text-stone-500 mt-5 mb-2 px-1">
              Summary
            </Text>
            <View className="p-4 bg-white rounded-2xl border border-stone-200 shadow-sm mb-2">
              <View className="flex-row justify-between items-center mb-1.5">
                <Text className="text-sm font-inter-medium text-stone-600">Subtotal</Text>
                <Text className="text-sm font-inter-semibold text-[#1C1917]" style={tabularNums}>
                  ${cartTotal.toFixed(2)}
                </Text>
              </View>
              {discountAmount > 0 && (
                <View className="flex-row justify-between items-center mb-1.5">
                  <View className="flex-row items-center flex-1 mr-2">
                    <Ionicons name="pricetag" size={13} color="#15803D" />
                    <Text className="text-sm font-inter-bold text-green-700 ml-1" numberOfLines={1}>
                      {appliedPromo?.title || 'Deal'}
                    </Text>
                  </View>
                  <Text className="text-sm font-inter-extrabold text-green-700" style={tabularNums}>
                    -${discountAmount.toFixed(2)}
                  </Text>
                </View>
              )}
              <View className="flex-row justify-between items-center">
                <Text className="text-sm font-inter-medium text-stone-600">Tax</Text>
                <Text className="text-sm font-inter-semibold text-[#1C1917]" style={tabularNums}>
                  ${taxAmount.toFixed(2)}
                </Text>
              </View>
              <View className="flex-row justify-between items-center mt-3 pt-3 border-t border-stone-100">
                <Text className="text-base font-inter-bold text-[#1C1917]">Total</Text>
                <Text className="text-lg font-inter-extrabold text-[#1C1917]" style={tabularNums}>
                  ${grandTotal.toFixed(2)}
                </Text>
              </View>
              {pointsEarned > 0 && (
                <View className="flex-row items-center bg-[#FAF6F0] rounded-lg px-2.5 py-1.5 mt-3">
                  <Ionicons name="star" size={14} color="#A61C14" />
                  <Text className="text-[13px] text-[#1C1917] ml-1.5 flex-1" numberOfLines={2}>
                    <Text className="font-inter-bold">Earns {pointsEarned.toLocaleString()} PaninoPoints</Text>
                    <Text className="text-stone-500"> · {pointsHint}</Text>
                  </Text>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {items.length > 0 && (
        <View className="px-4 pt-3 pb-8 border-t border-stone-200 bg-white">
          {discountAmount > 0 && (
            <Text className="text-center text-[13px] font-inter-bold text-green-700 mb-2">
              You're saving ${discountAmount.toFixed(2)} on this order
            </Text>
          )}
          <TouchableOpacity
            className={`py-4 px-5 rounded-2xl items-center shadow-sm flex-row justify-between ${
              checkoutBlockedLabel ? 'bg-stone-300' : 'bg-[#A61C14] active:bg-[#85140E]'
            }`}
            onPress={shortfallBlocked ? handleShortfallPress : () => handleCheckout()}
            disabled={isSubmitting || (!!checkoutBlockedLabel && !shortfallBlocked)}
          >
            {isSubmitting ? (
              <View className="flex-1 items-center">
                <ActivityIndicator color="#F4ECE1" />
              </View>
            ) : checkoutBlockedLabel ? (
              <View className="flex-1 items-center">
                <Text className="text-stone-500 font-inter-bold text-base">{checkoutBlockedLabel}</Text>
              </View>
            ) : (
              <>
                <Text className="text-[#F4ECE1] font-inter-bold text-base">Place Order</Text>
                <View className="flex-row items-center">
                  <Text className="text-[#F4ECE1] font-inter-bold text-lg mr-1.5" style={tabularNums}>${grandTotal.toFixed(2)}</Text>
                  <Ionicons name="arrow-forward" size={18} color="#F4ECE1" />
                </View>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <CountryPickerSheet
        visible={countryPickerVisible}
        onClose={() => setCountryPickerVisible(false)}
        onSelect={(selected) => {
          setGuestCountry(selected);
          setCountryPickerVisible(false);
        }}
        keyboardHeight={keyboardHeight}
      />

      <OrderTypeSheet visible={orderTypeSheetVisible} onClose={() => setOrderTypeSheetVisible(false)} />

      <TimeSlotPickerSheet
        visible={timePickerVisible}
        onClose={() => setTimePickerVisible(false)}
        onSelect={(slot) => {
          setSelectedSlot(slot);
          setTimePickerVisible(false);
        }}
        orderDays={orderDays}
        asapAvailable={asapAvailable}
        asapLabel={`${estimateReadyMinutes(orderType, itemCount, rushMinutes)} min`}
        selected={selectedSlot}
        days={isCateringOrder ? cateringDays : undefined}
      />

      {/* Starts with whatever they've already typed into the guest form. */}
      <AccountSetupSheet
        visible={accountSetupVisible}
        mode="upgrade"
        initialValues={{
          firstName: guestFirstName,
          lastName: guestLastName,
          phone: guestPhone ? `+${guestCountry.dialCode}${guestPhone}` : null,
        }}
        onClose={() => setAccountSetupVisible(false)}
        onDone={() => {
          setAccountSetupVisible(false);
          welcomeNewAccount(router);
        }}
      />

      {/* An Apple/Google account's name and phone, asked for at its first
          checkout -- the order goes ahead as soon as they're saved. */}
      <AccountSetupSheet
        visible={detailsSheetVisible}
        mode="details"
        initialValues={{ firstName: profile?.first_name, lastName: profile?.last_name, phone: profile?.phone }}
        onClose={() => setDetailsSheetVisible(false)}
        onDone={() => {
          setDetailsSheetVisible(false);
          handleCheckout();
        }}
      />
    </View>
  );
}