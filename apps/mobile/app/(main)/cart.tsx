import { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Keyboard, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { useCartStore, CartItem } from '../../store/cartStore';
import { useLocationStore } from '../../store/locationStore';
import { useAuthStore } from '../../store/authStore';
import { usePromoStore } from '../../store/promoStore';
import { useBackHandler } from '../../hooks/useBackHandler';
import { useLocationDetails } from '../../hooks/useLocationDetails';
import { appliedPromoFromRow, evaluatePromo, hasCategoryScope, hasUserRedeemedCode, resolvePromoCategoryIds } from '../../lib/promoEligibility';
import NotifyPreferenceToggle from '../../components/NotifyPreferenceToggle';
import CountryPickerSheet from '../../components/CountryPickerSheet';
import TimeSlotPickerSheet from '../../components/TimeSlotPickerSheet';
import CartUpsellTray from '../../components/CartUpsellTray';
import { isValidEmail } from '../../lib/passwordStrength';
import { estimateReadyMinutes, formatDayAndTime, getPickupSlots } from '../../lib/orderTiming';
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

const hapticSuccess = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
const hapticError = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});

export default function CartScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { items, locationId, removeItem, updateItemQuantity, clearCart, orderType, deliveryAddress, removeItemsByPromoCode } = useCartStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { session } = useAuthStore();
  const [isAnonymous] = useState(() => session?.user?.is_anonymous ?? false);

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
  const [menuItemInfoMap, setMenuItemInfoMap] = useState<Record<string, { categoryId: string; name: string }>>({});
  const [cateringCompany, setCateringCompany] = useState('');
  const [cateringSuite, setCateringSuite] = useState('');
  const [cateringDropoff, setCateringDropoff] = useState('');

  const cartTotal = items.reduce((sum: number, item: CartItem) => sum + item.totalPrice, 0);
  const rewardPromoCodes = Array.from(new Set(items.map((item) => item.promoCode).filter((c): c is string => !!c)));
  const activePromoCode = appliedPromo?.code ?? rewardPromoCodes[0] ?? null;

  const browsingLocationId = useLocationStore(state => state.locationId);
  const goBack = useCallback(() => {
    const backLocationId = browsingLocationId ?? locationId;
    router.replace(backLocationId ? `/(main)/menu/${backLocationId}` : '/(main)');
  }, [browsingLocationId, locationId, router]);
  useBackHandler(goBack);

  // A category-scoped promo (applied here or from Deals) has to be resolved
  // against this cart's location before it can be priced -- categories are
  // duplicated per location -- and needs each cart item's category/name.
  // Re-runs if the cart's location changes under an applied promo.
  useEffect(() => {
    if (!appliedPromo || !locationId || !hasCategoryScope(appliedPromo)) return;
    const needsResolve = appliedPromo.resolvedForLocationId !== locationId;
    if (!needsResolve && Object.keys(menuItemInfoMap).length > 0) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('menu_items')
        .select('id, category_id, name')
        .eq('location_id', locationId);
      if (cancelled) return;
      if (!error && data) {
        setMenuItemInfoMap(Object.fromEntries(data.map((m: any) => [m.id, { categoryId: m.category_id, name: m.name }])));
      }
      if (needsResolve) {
        const ids = await resolvePromoCategoryIds(appliedPromo, locationId);
        if (!cancelled) setAppliedPromo({ ...appliedPromo, resolvedCategoryIds: ids, resolvedForLocationId: locationId });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appliedPromo?.code, appliedPromo?.resolvedForLocationId, locationId]);

  // Still resolving the promo's categories for this location -- priced at
  // $0 with no "unmet" message rather than briefly flashing a wrong one.
  const promoPending =
    !!appliedPromo &&
    hasCategoryScope(appliedPromo) &&
    (appliedPromo.resolvedForLocationId !== locationId || Object.keys(menuItemInfoMap).length === 0);

  // Live, Domino's-style: every rule (minimum order, buy-2, pickup-only) is
  // re-checked on every cart/order-type change, so the discount drops to $0
  // with a reason when a rule stops being met and comes back once it is.
  const promoEvaluation = useMemo(() => {
    if (!appliedPromo || promoPending) return { discount: 0, unmetReason: null };
    return evaluatePromo(
      items,
      appliedPromo,
      hasCategoryScope(appliedPromo) ? appliedPromo.resolvedCategoryIds ?? [] : null,
      menuItemInfoMap,
      orderType
    );
  }, [items, appliedPromo, promoPending, menuItemInfoMap, orderType]);
  const discountAmount = promoEvaluation.discount;

  const { data: locationDetails } = useLocationDetails(locationId);
  const taxRate = locationDetails?.taxRate ?? 0.13;
  const locationName = locationDetails?.name ?? null;
  const locationHours = locationDetails?.hours ?? null;

  const discountedSubtotal = Math.max(0, cartTotal - discountAmount);
  const taxAmount = discountedSubtotal * taxRate;
  const grandTotal = discountedSubtotal + taxAmount;

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const pickupSlots = useMemo(
    () => getPickupSlots(locationHours, orderType, itemCount),
    [locationHours, orderType, itemCount]
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

  // Why Place Order is greyed out, if it is -- shown on the button itself.
  const checkoutBlockedLabel = isCateringOrder && isAnonymous
    ? 'Account Needed for Catering'
    : isCateringOrder && cateringShortfall > 0
    ? `Add $${cateringShortfall.toFixed(2)} for Catering`
    : isAnonymous && !emailVerified
    ? 'Verify Email Above to Continue'
    : null;

  const handleCreateAccountForCatering = () => {
    Alert.alert(
      'Create an Account',
      'This ends your guest session and empties your cart. On the next screen, tap Sign Up to create a free account, then place your catering order.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: async () => {
            await supabase.auth.signOut().catch(console.warn);
            // Same exit as every other sign-out (Profile, More) -- the root
            // auth guard expects to land on login once the session is gone.
            useAuthStore.getState().setSession(null);
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    setApplyingPromo(true);
    try {
      const { data: promo, error } = await (supabase as any)
        .from('promotions')
        .select('*')
        .ilike('code', promoCode.trim())
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
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
        const { data: menuItems, error: miError } = await supabase
          .from('menu_items')
          .select('id, category_id, name')
          .eq('location_id', locationId);
        if (miError) throw miError;
        setMenuItemInfoMap(
          Object.fromEntries((menuItems || []).map((m: any) => [m.id, { categoryId: m.category_id, name: m.name }]))
        );
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

  useEffect(() => {
    if (isAnonymous || !session?.user?.id) return;
    (async () => {
      const { data, error } = await (supabase as any)
        .from('profiles')
        .select('notify_email, notify_sms')
        .eq('id', session.user.id)
        .single();
      if (!error && data) {
        setNotifyEmail(data.notify_email ?? true);
        setNotifySms(data.notify_sms ?? false);
      }
    })();
  }, [session?.user?.id, isAnonymous]);

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
      setOtpSent(false);
      setOtpCode('');
    } catch (e: any) {
      Alert.alert('Invalid Code', e.message);
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleCheckout = async () => {
    if (!locationId || items.length === 0) return;

    if (orderType === 'delivery' && !deliveryAddress) {
      hapticError();
      Alert.alert('Missing Address', 'Please provide a delivery address before checking out.');
      return;
    }

    if (isCateringOrder) {
      if (isAnonymous) {
        hapticError();
        Alert.alert('Account Needed', 'Catering orders need a free account so we can confirm the details with you.');
        return;
      }
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
        // Delivery radius. Fails open: if the phone can't look the address
        // up, the order still goes through -- staff confirm every catering
        // order by phone anyway, and a wrongly refused order is worse.
        const storeLat = locationDetails?.latitude;
        const storeLng = locationDetails?.longitude;
        if (storeLat != null && storeLng != null) {
          try {
            const [match] = await Location.geocodeAsync(deliveryAddress);
            if (match) {
              const km = distanceKm(storeLat, storeLng, match.latitude, match.longitude);
              if (km > CATERING_MAX_DELIVERY_KM) {
                hapticError();
                Alert.alert(
                  'Outside Delivery Area',
                  `We deliver catering up to ${CATERING_MAX_DELIVERY_KM} km from the store, and this address is about ${Math.round(km)} km away. You can switch to pickup instead.`
                );
                return;
              }
            }
          } catch (e: any) {
            console.warn('Catering distance check skipped:', e?.message);
          }
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
        customerName = `${profile.first_name} ${profile.last_name}`;
        customerPhone = profile.phone;
      }

      // Only a code that actually took money off is recorded (and, for a
      // single-use code, spent) -- applying a deal whose rules the cart
      // never met mustn't burn the customer's one use of it for $0.
      const promoCodeUsed = appliedPromo && discountAmount > 0 ? appliedPromo.code : null;

      const estimatedReadyAt = (
        selectedSlot ?? new Date(Date.now() + estimateReadyMinutes(orderType, itemCount) * 60000)
      ).toISOString();

      const { data: orderData, error: orderError } = await (supabase as any)
        .from('orders')
        .insert({
          location_id: locationId,
          user_id: user?.id,
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_email: isAnonymous ? guestEmail.trim() : user?.email,
          notify_email: notifyEmail,
          notify_sms: notifySms,
          subtotal_amount: cartTotal,
          discount_amount: discountAmount,
          requested_ready_at: selectedSlot ? selectedSlot.toISOString() : null,
          promo_code: promoCodeUsed ?? rewardPromoCodes[0] ?? null,
          tax_amount: taxAmount,
          total_amount: grandTotal,
          status: 'received',
          order_type: orderType,
          delivery_address: orderType === 'delivery' ? deliveryAddress : null,
          estimated_ready_at: estimatedReadyAt,
          is_catering: isCateringOrder,
          catering_company: isCateringOrder && cateringCompany.trim() ? cateringCompany.trim() : null,
          catering_notes:
            isCateringOrder && orderType === 'delivery'
              ? [
                  cateringSuite.trim() && `Floor/Suite: ${cateringSuite.trim()}`,
                  cateringDropoff.trim() && `Drop-off: ${cateringDropoff.trim()}`,
                ].filter(Boolean).join('\n') || null
              : null,
        })
        .select('id')
        .single();

      if (orderError) throw orderError;

      for (const item of items) {
        const { data: orderItemData, error: itemError } = await (supabase as any)
          .from('order_items')
          .insert({
            order_id: orderData.id,
            menu_item_id: item.menuItemId,
            quantity: item.quantity,
            unit_price: item.basePrice,
            total_price: item.totalPrice,
            special_instructions: item.specialInstructions || null
          })
          .select('id')
          .single();

        if (itemError) throw itemError;

        if (item.modifiers && item.modifiers.length > 0) {
          const modsToInsert = item.modifiers.map((mod: any) => ({
            order_item_id: orderItemData.id,
            modifier_option_id: mod.optionId,
            price_adjustment: mod.price
          }));

          const { error: modError } = await (supabase as any).from('order_item_modifiers').insert(modsToInsert);
          if (modError) throw modError;
        }
      }

      if (promoCodeUsed) {
        const { error: promoError } = await (supabase as any).rpc('mark_promo_used', { p_code: promoCodeUsed });
        if (promoError) console.warn('Failed to mark promo code used:', promoError.message);
      }
      for (const code of rewardPromoCodes) {
        const { error: promoError } = await (supabase as any).rpc('mark_promo_used', { p_code: code });
        if (promoError) console.warn('Failed to mark reward code used:', promoError.message);
      }

      queryClient.invalidateQueries({ queryKey: ['promotions'] });
      queryClient.invalidateQueries({ queryKey: ['usedPromoCodes'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['wheelPromo'] });

      const wasCatering = isCateringOrder;
      clearCart();
      setAppliedPromo(null);
      setSelectedSlot(null);
      setCateringCompany('');
      setCateringSuite('');
      setCateringDropoff('');
      hapticSuccess();
      Alert.alert(
        wasCatering ? 'Catering Order Received!' : 'Order Placed!',
        wasCatering
          ? "We'll call you to confirm the details before we start preparing it."
          : 'You can track its status now.',
        [{ text: 'Track Order', onPress: () => router.replace(`/(main)/order/${orderData.id}`) }]
      );

    } catch (error: any) {
      hapticError();
      Alert.alert('Checkout Failed', error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-12">
      <View className="flex-row items-center justify-between px-4 mb-2">
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={goBack}
            className="flex-row items-center py-2 pr-4 -ml-2"
          >
            <Ionicons name="chevron-back" size={26} color="#A61C14" />
            <Text className="text-[#A61C14] font-inter-bold text-base">Back</Text>
          </TouchableOpacity>
          <Text className="text-2xl font-display-bold ml-1 text-[#1C1917] tracking-tight">
            Cart{itemCount > 0 ? ` (${itemCount})` : ''}
          </Text>
        </View>

        {items.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              Alert.alert('Clear Cart', 'Remove everything from your cart?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: clearCart },
              ]);
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            className="px-2 py-1"
          >
            <Text className="text-stone-500 font-inter-medium text-xs">Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {items.length > 0 && (
        <View className="mx-4 mb-3 bg-white p-3.5 rounded-2xl border border-stone-200 shadow-sm">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center flex-1 mr-2">
              <View className="w-9 h-9 rounded-full bg-[#FAF6F0] items-center justify-center mr-3 border border-stone-200">
                <Ionicons name={orderType === 'delivery' ? 'bicycle' : 'bag-handle'} size={18} color="#A61C14" />
              </View>
              <View className="flex-1">
                <Text className="text-[11px] font-inter-bold uppercase tracking-wider text-stone-500">
                  {orderType === 'delivery' ? 'Delivery' : `Carryout${locationName ? ` • ${locationName}` : ''}`}
                </Text>
                <Text
                  className={`text-sm font-inter-bold ${isCateringOrder && !selectedSlot ? 'text-[#A61C14]' : 'text-[#1C1917]'}`}
                  numberOfLines={1}
                >
                  {selectedSlot
                    ? `${orderType === 'delivery' ? 'Arriving' : 'Ready'} ${formatDayAndTime(selectedSlot)}`
                    : isCateringOrder
                    ? 'Choose a date & time'
                    : `ASAP (~${estimateReadyMinutes(orderType, itemCount)} min)`}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => setTimePickerVisible(true)}
              className="bg-[#FAF6F0] px-3 py-1.5 rounded-xl border border-stone-200"
            >
              <Text className="text-xs font-inter-bold text-[#A61C14]">{isCateringOrder && !selectedSlot ? 'Choose' : 'Change'}</Text>
            </TouchableOpacity>
          </View>
          {orderType === 'delivery' && (
            <View className="mt-2.5 pt-2.5 border-t border-stone-100">
              <Text className="text-[11px] font-inter-bold uppercase tracking-wider text-stone-500 mb-0.5">
                Delivering To
              </Text>
              <Text className="text-sm font-inter-semibold text-[#1C1917]">
                {deliveryAddress || 'Address required'}
              </Text>
            </View>
          )}
        </View>
      )}

      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: keyboardHeight + 20 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
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
            {isCateringOrder && (
              <View className="mb-3 p-4 bg-white rounded-2xl border border-[#A61C14] shadow-sm">
                <View className="flex-row items-center mb-1">
                  <Ionicons name="people" size={16} color="#A61C14" />
                  <Text className="text-[#A61C14] font-inter-extrabold text-xs uppercase tracking-wider ml-1.5">
                    Catering Order
                  </Text>
                </View>
                <Text className="text-[#1C1917] text-sm">{CATERING_RULES_SUMMARY}</Text>
                <Text className="text-[#78716C] text-xs mt-1">
                  We'll call you to confirm before we start preparing it.
                </Text>
                {cateringShortfall > 0 && (
                  <View className="flex-row items-center mt-2 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                    <Ionicons name="lock-closed" size={12} color="#B45309" />
                    <Text className="text-amber-800 text-xs font-inter-semibold ml-1.5 flex-1">
                      Add ${cateringShortfall.toFixed(2)} more to reach the ${CATERING_MIN_SUBTOTAL} catering minimum.
                    </Text>
                  </View>
                )}
                {isAnonymous && (
                  <View className="mt-3 pt-3 border-t border-stone-100">
                    <Text className="text-[#1C1917] text-sm font-inter-semibold mb-2">
                      Catering orders need a free account so we can confirm the details with you.
                    </Text>
                    <TouchableOpacity
                      onPress={handleCreateAccountForCatering}
                      className="bg-[#1C1917] py-2.5 rounded-xl items-center"
                    >
                      <Text className="text-[#F4ECE1] font-inter-bold text-sm">Create an Account</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {items.map(item => (
              <View key={item.cartItemId} className="bg-white p-4 rounded-2xl border border-stone-200 mb-3 shadow-sm">
                <View className="flex-row justify-between items-start">
                  {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} className="w-14 h-14 rounded-xl bg-stone-100 mr-3" resizeMode="cover" />
                  ) : (
                    <View className="w-14 h-14 rounded-xl bg-[#FAF6F0] items-center justify-center mr-3">
                      <Ionicons name="restaurant" size={20} color="#A8A29E" />
                    </View>
                  )}
                  <View className="flex-1 pr-3">
                    <View className="flex-row items-center flex-wrap mb-1">
                      <Text className="text-base font-inter-bold text-[#1C1917]">{item.name}</Text>
                      {item.promoCode && (
                        <View className="bg-[#A61C14] rounded-full px-2 py-0.5 ml-2">
                          <Text className="text-[#F4ECE1] text-[10px] font-inter-bold">FREE</Text>
                        </View>
                      )}
                    </View>
                    {item.modifiers.length > 0 && (
                      <View className="flex-row flex-wrap mt-1">
                        {item.modifiers.map(mod => (
                          <View
                            key={mod.optionId}
                            className="bg-[#FAF6F0] border border-stone-200 rounded-md px-2 py-0.5 mr-1.5 mb-1.5"
                          >
                            <Text className="text-stone-600 text-xs font-inter-medium">
                              + {mod.name}{!item.promoCode && mod.price > 0 ? ` ($${mod.price.toFixed(2)})` : ''}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {item.specialInstructions && (
                      <Text className="text-stone-400 text-xs italic mt-0.5">
                        "{item.specialInstructions}"
                      </Text>
                    )}
                  </View>
                  <Text className="text-base font-inter-bold text-[#1C1917]" style={tabularNums}>
                    ${item.totalPrice.toFixed(2)}
                  </Text>
                </View>
                <View className="flex-row justify-between items-center mt-3 pt-2.5 border-t border-stone-100">
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                      removeItem(item.cartItemId);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text className="text-stone-400 font-inter-medium text-xs">Remove</Text>
                  </TouchableOpacity>
                  {item.promoCode ? (
                    <Text className="text-xs font-inter-semibold text-stone-500">Qty: {item.quantity}</Text>
                  ) : (
                    <View className="flex-row items-center bg-stone-100 rounded-lg p-1 border border-stone-200">
                      <TouchableOpacity
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          updateItemQuantity(item.cartItemId, item.quantity - 1);
                        }}
                        className="bg-white w-7 h-7 rounded-md items-center justify-center shadow-sm"
                      >
                        <Ionicons name="remove" size={14} color="#1C1917" />
                      </TouchableOpacity>
                      <Text className="font-inter-bold text-[#1C1917] text-sm w-7 text-center">{item.quantity}</Text>
                      <TouchableOpacity
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          updateItemQuantity(item.cartItemId, item.quantity + 1);
                        }}
                        className="bg-white w-7 h-7 rounded-md items-center justify-center shadow-sm"
                      >
                        <Ionicons name="add" size={14} color="#1C1917" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            ))}

            {/* Sauce/meal/dessert upsells are for individual orders -- not
                shown on a catering order. */}
            {locationId && !isCateringOrder && (
              <CartUpsellTray items={items} locationId={locationId} cartTotal={cartTotal} />
            )}

            <View className="my-2 p-3.5 bg-white rounded-2xl border border-stone-200 shadow-sm">
              {activePromoCode ? (
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center flex-1 mr-2">
                    <Ionicons name="pricetag" size={16} color="#A61C14" />
                    <View className="ml-2 flex-1">
                      <Text className="text-[#1C1917] font-inter-bold text-sm" numberOfLines={1}>
                        Code {activePromoCode} applied
                      </Text>
                      {!!appliedPromo && !!promoEvaluation.unmetReason && (
                        <View className="flex-row items-center mt-0.5">
                          <Ionicons name="lock-closed" size={11} color="#B45309" />
                          <Text className="text-amber-700 text-xs font-inter-medium ml-1 flex-1">
                            {promoEvaluation.unmetReason}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      if (appliedPromo) setAppliedPromo(null);
                      else removeItemsByPromoCode(activePromoCode);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={20} color="#78716C" />
                  </TouchableOpacity>
                </View>
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
                    <Text className="text-xs font-inter-bold text-stone-500 uppercase">Promo Code</Text>
                    <TouchableOpacity onPress={() => setPromoInputOpen(false)}>
                      <Text className="text-xs text-stone-400 font-inter-medium">Cancel</Text>
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
                        <Text className={`text-xs font-inter-bold ${!promoCode.trim() ? 'text-stone-500' : 'text-[#F4ECE1]'}`}>Apply</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {isCateringOrder && !isAnonymous && (
              <View className="my-2 p-4 bg-white rounded-2xl border border-stone-200 shadow-sm">
                <Text className="text-base font-inter-bold text-[#1C1917] mb-3">Catering Details</Text>
                <TextInput
                  className="bg-[#FAF6F0] border border-stone-300 px-3 py-2.5 rounded-xl text-sm text-[#1C1917]"
                  placeholder="Company or event name (optional)"
                  placeholderTextColor="#A8A29E"
                  value={cateringCompany}
                  onChangeText={setCateringCompany}
                />
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
                    <Text className="text-[11px] text-[#78716C] mt-1.5">
                      Catering delivery is available up to {CATERING_MAX_DELIVERY_KM} km from the store.
                    </Text>
                  </>
                )}
              </View>
            )}

            {isAnonymous && (
              <View className="my-2 p-4 bg-white rounded-2xl border border-stone-200 shadow-sm">
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-base font-inter-bold text-[#1C1917]">Contact & Pickup Info</Text>
                  <View className="bg-stone-100 px-2 py-0.5 rounded-full">
                    <Text className="text-[10px] font-inter-bold text-stone-500">GUEST CHECKOUT</Text>
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
                    <Text className="text-xs font-inter-semibold text-[#1C1917] mr-1">+{guestCountry.dialCode}</Text>
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
                    <Text className="text-green-700 font-inter-semibold text-xs ml-1.5">Email verified</Text>
                  </View>
                ) : otpSent ? (
                  <View className="mt-2.5 bg-stone-50 p-3 rounded-xl border border-stone-200">
                    <Text className="text-stone-600 text-xs mb-2">
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
                          <Text className="text-[#F4ECE1] font-inter-bold text-xs">Verify</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={handleSendCode} disabled={sendingOtp} className="mt-2 self-start">
                      <Text className="text-[#A61C14] font-inter-semibold text-xs">Resend Code</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={handleSendCode}
                    disabled={sendingOtp}
                    className="bg-[#1C1917] py-2.5 rounded-xl items-center mt-2.5"
                  >
                    {sendingOtp ? (
                      <ActivityIndicator size="small" color="#F4ECE1" />
                    ) : (
                      <Text className="text-[#F4ECE1] font-inter-bold text-xs">Verify Email to Continue</Text>
                    )}
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
          </>
        )}
      </ScrollView>

      {items.length > 0 && (
        <View className="px-5 pt-3 pb-8 border-t border-stone-200 bg-white shadow-lg">
          <View className="flex-row justify-between items-center mb-1">
            <Text className="text-xs font-inter-medium text-stone-500">Subtotal</Text>
            <Text className="text-xs font-inter-semibold text-[#1C1917]" style={tabularNums}>${cartTotal.toFixed(2)}</Text>
          </View>
          {discountAmount > 0 && (
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-xs font-inter-medium text-green-700">Discount ({appliedPromo?.code})</Text>
              <Text className="text-xs font-inter-bold text-green-700" style={tabularNums}>-${discountAmount.toFixed(2)}</Text>
            </View>
          )}
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-xs font-inter-medium text-stone-500">Tax</Text>
            <Text className="text-xs font-inter-semibold text-[#1C1917]" style={tabularNums}>${taxAmount.toFixed(2)}</Text>
          </View>

          <TouchableOpacity
            className={`py-4 px-5 rounded-2xl items-center shadow-sm flex-row justify-between ${
              checkoutBlockedLabel ? 'bg-stone-300' : 'bg-[#A61C14] active:bg-[#85140E]'
            }`}
            onPress={handleCheckout}
            disabled={isSubmitting || !!checkoutBlockedLabel}
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

      <TimeSlotPickerSheet
        visible={timePickerVisible}
        onClose={() => setTimePickerVisible(false)}
        onSelect={(slot) => {
          setSelectedSlot(slot);
          setTimePickerVisible(false);
        }}
        slots={pickupSlots}
        asapLabel={`${estimateReadyMinutes(orderType, itemCount)} min`}
        selected={selectedSlot}
        days={isCateringOrder ? cateringDays : undefined}
      />
    </View>
  );
}