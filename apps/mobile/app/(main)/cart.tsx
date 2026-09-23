import { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Keyboard, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { useCartStore, CartItem } from '../../store/cartStore';
import { useLocationStore } from '../../store/locationStore';
import { useAuthStore } from '../../store/authStore';
import { usePromoStore } from '../../store/promoStore';
import { useBackHandler } from '../../hooks/useBackHandler';
import { useLocationDetails } from '../../hooks/useLocationDetails';
import { computeEligibleDiscount, hasUserRedeemedCode, resolvePromoCategoryId } from '../../lib/promoEligibility';
import NotifyPreferenceToggle from '../../components/NotifyPreferenceToggle';
import CountryPickerSheet from '../../components/CountryPickerSheet';
import TimeSlotPickerSheet from '../../components/TimeSlotPickerSheet';
import CartUpsellTray from '../../components/CartUpsellTray';
import { isValidEmail } from '../../lib/passwordStrength';
import { estimateReadyMinutes, getPickupSlots } from '../../lib/orderTiming';
import { Country, DEFAULT_COUNTRY, formatPhoneNumber, isValidPhoneForCountry, parsePhone } from '../../lib/countries';

const hapticSuccess = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
const hapticError = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});

export default function CartScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { items, locationId, removeItem, updateItemQuantity, clearCart, orderType, deliveryAddress, removeItemsByPromoCode } = useCartStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { session } = useAuthStore();
  // Verifying email during guest checkout (below) flips the session's
  // is_anonymous flag mid-flow, since it attaches a real email to the
  // anonymous user -- captured once at mount so the rest of this screen
  // keeps treating this as a guest checkout instead of switching to the
  // registered-user path (which would look up name/phone/email from an
  // empty profile row) partway through.
  const [isAnonymous] = useState(() => session?.user?.is_anonymous ?? false);

  const [guestFirstName, setGuestFirstName] = useState('');
  const [guestLastName, setGuestLastName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestCountry, setGuestCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  // A guest's anonymous session persists across app restarts (see
  // orders.tsx) -- if they already verified an email in a previous order
  // this same session, Supabase already has it confirmed, so seed from
  // that instead of making them redo the whole OTP flow every order.
  const [guestEmail, setGuestEmail] = useState(() => session?.user?.email ?? '');
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifySms, setNotifySms] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  // Tracks which exact email address was verified -- if the guest edits the
  // field afterwards it no longer matches, so they have to re-verify. The
  // field itself always stays editable (an earlier version locked it once
  // verified, which meant a typo'd email had no way back) -- editing it away
  // from verifiedEmail is exactly what should flip emailVerified back to
  // false and ask for re-verification.
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(() => session?.user?.email ?? null);
  const emailVerified = !!verifiedEmail && verifiedEmail === guestEmail.trim();
  // null = ASAP (the default) -- a specific Date means the customer
  // committed to a slot instead of an open-ended estimate.
  const [selectedSlot, setSelectedSlot] = useState<Date | null>(null);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [applyingPromo, setApplyingPromo] = useState(false);
  // Collapsed by default -- an always-open text box is one more thing to
  // visually parse for the vast majority of carts that never use a promo
  // code at all.
  const [promoInputOpen, setPromoInputOpen] = useState(false);
  // Shared with the Deals screen -- applying a code there shows up applied
  // here too, and vice versa.
  const { appliedPromo, setAppliedPromo } = usePromoStore();
  // Category + name per menu item for this location -- fetched whenever a
  // category-scoped promo is applied, regardless of whether it was applied
  // here or from the Deals screen, so the discount is never stuck at $0
  // just because this screen didn't do the fetching itself. Name is needed
  // too since some promos (e.g. "Free Fries" off the wheel) narrow down to
  // specific item names within a category, not the whole category.
  const [menuItemInfoMap, setMenuItemInfoMap] = useState<Record<string, { categoryId: string; name: string }>>({});

  const cartTotal = items.reduce((sum: number, item: CartItem) => sum + item.totalPrice, 0);
  // Wheel-prize/PaninoPoints rewards tag their free cart line with the code
  // that earned it (see cartStore's addFreeItem and item/[id].tsx) rather
  // than going through appliedPromo -- gathered here so checkout marks every
  // one of them used, not just a manually-applied coupon code.
  const rewardPromoCodes = Array.from(new Set(items.map((item) => item.promoCode).filter((c): c is string => !!c)));
  // The Promo Code box below should read as "applied" (locked, not an
  // editable input) whenever a reward's free item is sitting in the cart,
  // exactly like it already does for a manually-applied appliedPromo coupon
  // -- otherwise it's left showing a blank, editable box even though a
  // promo genuinely is in effect.
  const activePromoCode = appliedPromo?.code ?? rewardPromoCodes[0] ?? null;

  // The cart store's own `locationId` only gets set once an item is added
  // (it's "which location these cart items belong to"), so it's null with
  // an empty cart -- back would then fall through to the locations picker
  // instead of returning to the menu the customer was actually browsing.
  // useLocationStore's locationId is the currently-browsing location
  // regardless of what's in the cart, so it's the right source for "back".
  const browsingLocationId = useLocationStore(state => state.locationId);
  const goBack = useCallback(() => {
    const backLocationId = browsingLocationId ?? locationId;
    router.replace(backLocationId ? `/(main)/menu/${backLocationId}` : '/(main)');
  }, [browsingLocationId, locationId]);
  useBackHandler(goBack);

  useEffect(() => {
    if (!appliedPromo || !locationId) return;
    if (!appliedPromo.categoryId && !appliedPromo.categoryName) return;
    (async () => {
      const { data, error } = await supabase
        .from('menu_items')
        .select('id, category_id, name')
        .eq('location_id', locationId);
      if (!error && data) {
        setMenuItemInfoMap(Object.fromEntries(data.map((m: any) => [m.id, { categoryId: m.category_id, name: m.name }])));
      }
      // A promo scoped by category NAME (e.g. wheel prizes -- see
      // lib/promoEligibility.ts) doesn't know a concrete category_id until
      // it's resolved against this location, which could differ from
      // wherever the promo was originally applied from.
      if (!appliedPromo.categoryId && appliedPromo.categoryName) {
        const resolvedId = await resolvePromoCategoryId(
          { category_id: null, category_name: appliedPromo.categoryName },
          locationId
        );
        if (resolvedId) setAppliedPromo({ ...appliedPromo, categoryId: resolvedId });
      }
    })();
  }, [appliedPromo?.categoryId, appliedPromo?.categoryName, locationId]);

  const discountAmount = useMemo(() => {
    if (!appliedPromo) return 0;
    return computeEligibleDiscount(
      items,
      {
        discountPercent: appliedPromo.discountPercent,
        categoryId: appliedPromo.categoryId,
        itemNamePatterns: appliedPromo.itemNamePatterns,
        maxDiscountAmount: appliedPromo.maxDiscountAmount,
      },
      menuItemInfoMap
    );
  }, [items, appliedPromo, menuItemInfoMap]);

  const discountedSubtotal = Math.max(0, cartTotal - discountAmount);
  const taxAmount = discountedSubtotal * taxRate;
  const grandTotal = discountedSubtotal + taxAmount;

  // Tax rate and hours live per-location (tax rate can vary by province;
  // hours feed the pickup-time slot picker below, never offering a slot
  // past closing) -- name is shown in the fulfillment strip so "Carryout"
  // reads as a real, specific location rather than a generic label.
  // 13% (Ontario HST) is just the fallback while this loads. A query hook
  // instead of a useEffect + direct call means re-opening the cart on the
  // same location doesn't re-fetch tax rate/hours it already has cached.
  const { data: locationDetails } = useLocationDetails(locationId);
  const taxRate = locationDetails?.taxRate ?? 0.13;
  const locationName = locationDetails?.name ?? null;
  const locationHours = locationDetails?.hours ?? null;

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const pickupSlots = useMemo(
    () => getPickupSlots(locationHours, orderType, itemCount),
    [locationHours, orderType, itemCount]
  );

  // The order type or item count changing invalidates whichever slot was
  // picked (the estimate/slot list it was chosen from no longer applies) --
  // back to ASAP rather than silently keeping a now-stale commitment.
  useEffect(() => {
    setSelectedSlot(null);
  }, [orderType, itemCount]);

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

      let infoMap = menuItemInfoMap;
      if ((promo.category_id || promo.category_name) && Object.keys(infoMap).length === 0 && locationId) {
        const { data: menuItems, error: miError } = await supabase
          .from('menu_items')
          .select('id, category_id, name')
          .eq('location_id', locationId);
        if (miError) throw miError;
        infoMap = Object.fromEntries(
          (menuItems || []).map((m: any) => [m.id, { categoryId: m.category_id, name: m.name }])
        );
        setMenuItemInfoMap(infoMap);
      }

      const resolvedCategoryId = locationId ? await resolvePromoCategoryId(promo, locationId) : promo.category_id;
      const discountPercent = Number(promo.discount_percent) || 0;
      const maxDiscountAmount = promo.max_discount_amount != null ? Number(promo.max_discount_amount) : null;

      const eligibleDiscount = computeEligibleDiscount(
        items,
        { discountPercent, categoryId: resolvedCategoryId, itemNamePatterns: promo.item_name_patterns, maxDiscountAmount },
        infoMap
      );
      if (eligibleDiscount <= 0) {
        hapticError();
        Alert.alert('No Eligible Items', 'None of the items currently in your cart qualify for this promo code.');
        return;
      }

      setAppliedPromo({
        code: promo.code,
        title: promo.title,
        discountPercent,
        categoryId: resolvedCategoryId,
        categoryName: promo.category_name,
        itemNamePatterns: promo.item_name_patterns,
        maxDiscountAmount,
      });
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

  // Registered users set their notification preference once, on their
  // profile (register.tsx / edit-profile.tsx) -- fetched here purely to
  // carry it onto the order at insert time, not shown as a checkout step.
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

  // Guests keep the same session across orders too (see orders.tsx), so
  // rather than making a returning guest retype everything, prefill from
  // whatever they entered on their most recent order in this session.
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
      hapticError();
      Alert.alert('Invalid Email', 'Please enter a valid email address first.');
      return;
    }
    setSendingOtp(true);
    try {
      // Attaches the email to this guest's existing anonymous session and
      // emails a 6-digit code (see the custom "email_change" template) --
      // there's no separate password or account to create.
      const { error } = await supabase.auth.updateUser({ email: guestEmail.trim() });
      if (error) throw error;
      setOtpSent(true);
      setOtpCode('');
      hapticSuccess();
    } catch (e: any) {
      hapticError();
      Alert.alert("Couldn't send code", e.message);
    } finally {
      setSendingOtp(false);
    }
  };

  // Takes the code directly when called from the input's auto-submit (state
  // hasn't flushed yet at that point), otherwise reads it from state.
  const handleVerifyCode = async (codeOverride?: string) => {
    const code = (codeOverride ?? otpCode).trim();
    if (code.length !== 6 || verifyingOtp) return;
    setVerifyingOtp(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: guestEmail.trim(),
        token: code,
        type: 'email_change',
      });
      if (error) throw error;
      setVerifiedEmail(guestEmail.trim());
      setOtpSent(false);
      setOtpCode('');
      hapticSuccess();
    } catch (e: any) {
      hapticError();
      Alert.alert('Invalid Code', e.message);
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleCheckout = async () => {
    if (!locationId || items.length === 0) return;

    if (orderType === 'delivery' && !deliveryAddress) {
      hapticError();
      Alert.alert('Missing Address', 'Please add a delivery address from the Pickup/Delivery option on the menu screen before checking out.');
      return;
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

      // 1. Create Order
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
          promo_code: appliedPromo?.code ?? rewardPromoCodes[0] ?? null,
          tax_amount: taxAmount,
          total_amount: grandTotal,
          status: 'received',
          order_type: orderType,
          delivery_address: orderType === 'delivery' ? deliveryAddress : null,
          estimated_ready_at: estimatedReadyAt
        })
        .select('id')
        .single();

      if (orderError) throw orderError;

      // 2. Insert Order Items and Modifiers
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

      // A personal one-time code (e.g. a wheel prize) is spent after this
      // order -- no-ops harmlessly for a shared/storewide code, since that
      // update only ever matches a row this account itself owns. Not
      // critical to the order itself, so a failure here is logged rather
      // than surfaced as a checkout failure.
      if (appliedPromo?.code) {
        const { error: promoError } = await (supabase as any).rpc('mark_promo_used', { p_code: appliedPromo.code });
        if (promoError) console.warn('Failed to mark promo code used:', promoError.message);
      }
      for (const code of rewardPromoCodes) {
        const { error: promoError } = await (supabase as any).rpc('mark_promo_used', { p_code: code });
        if (promoError) console.warn('Failed to mark reward code used:', promoError.message);
      }

      // Deals and Profile are hidden tabs that stay mounted once visited
      // (the Tabs navigator never unmounts them just from switching tabs),
      // so their own promotions/profile queries won't refetch on their own
      // just because the user navigates back to them -- without this, a
      // just-redeemed welcome prize (or any single-use code) would still
      // show as available there until something else happened to trigger a
      // refetch. Prefix-matching the query keys catches every variant
      // (different locationId/session) those screens use.
      queryClient.invalidateQueries({ queryKey: ['promotions'] });
      queryClient.invalidateQueries({ queryKey: ['usedPromoCodes'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['wheelPromo'] });

      clearCart();
      setAppliedPromo(null);
      setSelectedSlot(null);
      hapticSuccess();
      Alert.alert('Order Placed!', 'You can track its status now.', [
        { text: 'Track Order', onPress: () => router.replace(`/(main)/order/${orderData.id}`) }
      ]);

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
            <Text className="text-[#A61C14] font-inter-bold text-lg">Back</Text>
          </TouchableOpacity>
          <Text className="text-2xl font-display-bold ml-1 text-[#1C1917]">
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
            <Text className="text-stone-500 font-inter-medium text-sm">Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Fulfillment strip -- folds together what used to be a separate
          "When would you like it?" card mid-scroll plus the order-type/ready
          rows repeated again in the bottom sheet, so this info exists in
          exactly one place instead of two slightly different-looking ones. */}
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
                <Text className="text-sm font-inter-bold text-[#1C1917]" numberOfLines={1}>
                  {selectedSlot
                    ? `${orderType === 'delivery' ? 'Arriving' : 'Ready'} at ${selectedSlot.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                    : `ASAP (~${estimateReadyMinutes(orderType, itemCount)} min)`}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => setTimePickerVisible(true)}
              className="bg-[#FAF6F0] px-3 py-1.5 rounded-xl border border-stone-200"
            >
              <Text className="text-xs font-inter-bold text-[#A61C14]">Change</Text>
            </TouchableOpacity>
          </View>
          {/* Full address, never truncated to one line -- a cut-off unit
              number is exactly the kind of thing that sends an order to the
              wrong door. */}
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
                  <Text className="text-base font-inter-bold text-[#1C1917]">
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
                  {/* A redeemed reward's free line is always exactly one item
                      (see item/[id].tsx) -- a stepper here would let someone
                      turn one redemption into several free sandwiches. */}
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
                        <Ionicons
                          name={item.quantity === 1 ? 'trash-outline' : 'remove'}
                          size={14}
                          color={item.quantity === 1 ? '#A61C14' : '#1C1917'}
                        />
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

            {locationId && (
              <CartUpsellTray items={items} locationId={locationId} cartTotal={cartTotal} />
            )}

            {/* Collapsible promo/reward code -- an always-open text box was
                one more thing to visually parse for the vast majority of
                carts that never use a code at all. */}
            <View className="my-2 p-3.5 bg-white rounded-2xl border border-stone-200 shadow-sm">
              {activePromoCode ? (
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center flex-1 mr-2">
                    <Ionicons name="pricetag" size={16} color="#A61C14" />
                    <Text className="text-[#1C1917] font-inter-bold text-sm ml-2" numberOfLines={1}>
                      Code {activePromoCode} applied
                    </Text>
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
                        onChangeText={(text) => {
                          const digits = text.replace(/[^0-9]/g, '');
                          setOtpCode(digits);
                          if (digits.length === 6) handleVerifyCode(digits);
                        }}
                      />
                      <TouchableOpacity
                        onPress={() => handleVerifyCode()}
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

            {/* Registered users already picked this at signup (editable from
                Edit Profile) -- re-asking at checkout every time is friction
                for a decision they already made. Guests have no profile to
                default from, so it's asked here instead. */}
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
            <Text className="text-xs font-inter-semibold text-[#1C1917]">${cartTotal.toFixed(2)}</Text>
          </View>
          {discountAmount > 0 && (
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-xs font-inter-medium text-green-700">Discount ({appliedPromo?.code})</Text>
              <Text className="text-xs font-inter-bold text-green-700">-${discountAmount.toFixed(2)}</Text>
            </View>
          )}
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-xs font-inter-medium text-stone-500">Tax</Text>
            <Text className="text-xs font-inter-semibold text-[#1C1917]">${taxAmount.toFixed(2)}</Text>
          </View>

          <TouchableOpacity
            className={`py-4 px-5 rounded-2xl items-center shadow-sm flex-row justify-between ${
              isAnonymous && !emailVerified ? 'bg-stone-300' : 'bg-[#A61C14] active:bg-[#85140E]'
            }`}
            onPress={handleCheckout}
            disabled={isSubmitting || (isAnonymous && !emailVerified)}
          >
            {isSubmitting ? (
              <View className="flex-1 items-center">
                <ActivityIndicator color="#F4ECE1" />
              </View>
            ) : isAnonymous && !emailVerified ? (
              <View className="flex-1 items-center">
                <Text className="text-stone-500 font-inter-bold text-base">Verify Email Above to Continue</Text>
              </View>
            ) : (
              <>
                <Text className="text-[#F4ECE1] font-inter-bold text-base">Place Order</Text>
                <View className="flex-row items-center">
                  <Text className="text-[#F4ECE1] font-inter-bold text-lg mr-1.5">${grandTotal.toFixed(2)}</Text>
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
      />
    </View>
  );
}
