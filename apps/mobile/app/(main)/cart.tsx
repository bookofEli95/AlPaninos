import { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Keyboard } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useCartStore, CartItem } from '../../store/cartStore';
import { useAuthStore } from '../../store/authStore';
import { usePromoStore } from '../../store/promoStore';
import { useBackHandler } from '../../hooks/useBackHandler';
import { computeEligibleDiscount, hasUserRedeemedCode, resolvePromoCategoryId } from '../../lib/promoEligibility';
import NotifyPreferenceToggle from '../../components/NotifyPreferenceToggle';
import CountryPickerSheet from '../../components/CountryPickerSheet';
import TimeSlotPickerSheet from '../../components/TimeSlotPickerSheet';
import { isValidEmail } from '../../lib/passwordStrength';
import { estimateReadyMinutes, getPickupSlots } from '../../lib/orderTiming';
import { WeekHours } from '../../lib/hours';
import { Country, DEFAULT_COUNTRY, isValidPhoneForCountry, parsePhone } from '../../lib/countries';

export default function CartScreen() {
  const router = useRouter();
  const { items, locationId, removeItem, clearCart, orderType, deliveryAddress } = useCartStore();
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
  // field afterwards it no longer matches, so they have to re-verify.
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(() => session?.user?.email ?? null);
  const emailVerified = !!verifiedEmail && verifiedEmail === guestEmail.trim();
  const [taxRate, setTaxRate] = useState(0.13);
  const [locationHours, setLocationHours] = useState<WeekHours | null>(null);
  // null = ASAP (the default) -- a specific Date means the customer
  // committed to a slot instead of an open-ended estimate.
  const [selectedSlot, setSelectedSlot] = useState<Date | null>(null);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [applyingPromo, setApplyingPromo] = useState(false);
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

  const goBack = useCallback(() => {
    router.replace(locationId ? `/(main)/menu/${locationId}` : '/(main)');
  }, [locationId]);
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

  // Tax rate lives per-location (see locations.tax_rate) since it can vary
  // by province -- 13% (Ontario HST) is just the fallback while this loads.
  // Hours feed the pickup-time slot picker below (never offer a slot past
  // closing).
  useEffect(() => {
    if (!locationId) return;
    (async () => {
      const { data, error } = await (supabase as any)
        .from('locations')
        .select('tax_rate, hours')
        .eq('id', locationId)
        .single();
      if (!error && data) {
        setTaxRate(Number(data.tax_rate));
        setLocationHours(data.hours ?? null);
      }
    })();
  }, [locationId]);

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
        Alert.alert('Invalid Code', "That promo code doesn't exist or is no longer active.");
        return;
      }

      if (promo.single_use !== false && session?.user?.id) {
        const alreadyRedeemed = await hasUserRedeemedCode(session.user.id, promo.code);
        if (alreadyRedeemed) {
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
        infoMap = Object.fromEntries((menuItems || []).map((m: any) => [m.id, { categoryId: m.category_id, name: m.name }]));
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
        Alert.alert('No Eligible Items', "None of the items currently in your cart qualify for this promo code.");
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
      setPromoCode('');
    } catch (e: any) {
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
      Alert.alert('Missing Address', 'Please provide a delivery address on the Home screen before checking out.');
      return;
    }

    if (isAnonymous && (!guestFirstName.trim() || !guestLastName.trim() || !guestPhone.trim() || !guestEmail.trim())) {
      Alert.alert('Missing Details', 'Please enter your name, phone number, and email for the order.');
      return;
    }
    if (isAnonymous && !isValidEmail(guestEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    if (isAnonymous && !isValidPhoneForCountry(guestPhone, guestCountry)) {
      Alert.alert('Invalid Phone', `Please enter a valid phone number for ${guestCountry.name}.`);
      return;
    }
    if (isAnonymous && !emailVerified) {
      Alert.alert('Verify Your Email', 'Please verify your email address before placing the order.');
      return;
    }
    if (!notifyEmail && !notifySms) {
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
          promo_code: appliedPromo?.code ?? null,
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

      clearCart();
      setAppliedPromo(null);
      setSelectedSlot(null);
      Alert.alert('Order Placed!', 'You can track its status now.', [
        { text: 'Track Order', onPress: () => router.replace(`/(main)/order/${orderData.id}`) }
      ]);

    } catch (error: any) {
      Alert.alert('Checkout Failed', error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-12">
      <View className="flex-row items-center justify-between px-4 mb-4">
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={goBack}
            className="flex-row items-center py-4 pr-8 -ml-2"
          >
            <Ionicons name="chevron-back" size={28} color="#A61C14" />
            <Text className="text-[#A61C14] font-bold text-xl">Back</Text>
          </TouchableOpacity>
          <Text className="text-2xl font-bold ml-2 text-[#1C1917]">Cart</Text>
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
            className="px-3 py-2"
          >
            <Text className="text-[#78716C] font-bold text-base">Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: keyboardHeight }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {items.map(item => (
          <View key={item.cartItemId} className="py-4 border-b border-stone-200">
            <View className="flex-row justify-between items-start mb-2">
              <View className="flex-1 pr-4">
                <Text className="text-lg font-bold text-[#1C1917]">
                  {item.quantity}x {item.name}
                </Text>
                {item.modifiers.map(mod => (
                  <Text key={mod.optionId} className="text-[#78716C] text-sm mt-1">
                    + {mod.name} {mod.price > 0 ? `($${mod.price.toFixed(2)})` : ''}
                  </Text>
                ))}
                {item.specialInstructions && (
                  <Text className="text-[#78716C] text-sm mt-1 italic">
                    Note: {item.specialInstructions}
                  </Text>
                )}
              </View>
              <Text className="text-lg font-bold text-[#A61C14]">
                ${item.totalPrice.toFixed(2)}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => removeItem(item.cartItemId)}
              className="self-start mt-2"
            >
              <Text className="text-[#A61C14] font-bold">Remove</Text>
            </TouchableOpacity>
          </View>
        ))}
        {items.length === 0 && (
          <Text className="text-center text-[#78716C] mt-10">Your cart is empty</Text>
        )}
        {items.length > 0 && isAnonymous && (
          <View className="my-4 p-4 bg-white rounded-2xl border border-stone-200 shadow-sm">
            <Text className="text-lg font-bold mb-3 text-[#1C1917]">Contact Details</Text>

            <View className="flex-row justify-between mb-3">
              <TextInput
                className="bg-white border border-stone-300 p-3 rounded-lg flex-1 mr-2 text-base text-[#1C1917]"
                placeholder="First Name"
                placeholderTextColor="#A8A29E"
                value={guestFirstName}
                onChangeText={setGuestFirstName}
              />
              <TextInput
                className="bg-white border border-stone-300 p-3 rounded-lg flex-1 ml-2 text-base text-[#1C1917]"
                placeholder="Last Name"
                placeholderTextColor="#A8A29E"
                value={guestLastName}
                onChangeText={setGuestLastName}
              />
            </View>

            <View className="flex-row mb-3">
              <TouchableOpacity
                onPress={() => setCountryPickerVisible(true)}
                className="flex-row items-center bg-white border border-stone-300 rounded-lg px-3 mr-2"
              >
                <Text className="text-base mr-1">{guestCountry.flag}</Text>
                <Text className="text-base font-semibold text-[#1C1917] mr-1">+{guestCountry.dialCode}</Text>
                <Ionicons name="chevron-down" size={14} color="#A8A29E" />
              </TouchableOpacity>
              <TextInput
                className="bg-white border border-stone-300 p-3 rounded-lg flex-1 text-base text-[#1C1917]"
                placeholder="Phone Number"
                placeholderTextColor="#A8A29E"
                keyboardType="phone-pad"
                value={guestPhone}
                onChangeText={(text) => setGuestPhone(text.replace(/[^0-9]/g, ''))}
              />
            </View>

            <TextInput
              className="bg-white border border-stone-300 p-3 rounded-lg text-base text-[#1C1917]"
              placeholder="Email"
              placeholderTextColor="#A8A29E"
              autoCapitalize="none"
              keyboardType="email-address"
              value={guestEmail}
              onChangeText={setGuestEmail}
              editable={!emailVerified}
            />

            {emailVerified ? (
              <View className="flex-row items-center mt-3">
                <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                <Text className="text-green-700 font-semibold text-sm ml-1">Email verified</Text>
              </View>
            ) : otpSent ? (
              <View className="mt-3">
                <Text className="text-[#78716C] text-sm mb-2">
                  Enter the 6-digit code we emailed to {guestEmail.trim()}.
                </Text>
                <TextInput
                  className="bg-white border border-stone-300 p-3 rounded-lg text-base text-[#1C1917] mb-2"
                  placeholder="6-digit code"
                  placeholderTextColor="#A8A29E"
                  keyboardType="number-pad"
                  maxLength={6}
                  value={otpCode}
                  onChangeText={setOtpCode}
                />
                <View className="flex-row items-center">
                  <TouchableOpacity
                    onPress={handleVerifyCode}
                    disabled={verifyingOtp || otpCode.trim().length !== 6}
                    className={`py-2.5 rounded-lg items-center flex-1 mr-2 ${
                      verifyingOtp || otpCode.trim().length !== 6 ? 'bg-stone-300' : 'bg-[#1C1917]'
                    }`}
                  >
                    {verifyingOtp ? (
                      <ActivityIndicator size="small" color="#F4ECE1" />
                    ) : (
                      <Text className="text-[#F4ECE1] font-bold text-sm">Verify</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleSendCode} disabled={sendingOtp} className="px-3 py-2.5">
                    <Text className="text-[#78716C] font-semibold text-sm">Resend</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleSendCode}
                disabled={sendingOtp}
                className="bg-[#1C1917] py-2.5 rounded-lg items-center mt-3"
              >
                {sendingOtp ? (
                  <ActivityIndicator size="small" color="#F4ECE1" />
                ) : (
                  <Text className="text-[#F4ECE1] font-bold text-sm">Send Verification Code</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
        {items.length > 0 && (
          <View className="my-4 p-4 bg-white rounded-2xl border border-stone-200 shadow-sm">
            <Text className="text-lg font-bold mb-3 text-[#1C1917]">Promo Code</Text>
            {appliedPromo ? (
              <View className="flex-row items-center justify-between bg-[#FAF6F0] border border-stone-300 rounded-lg px-4 py-3">
                <View className="flex-row items-center flex-1 mr-2">
                  <Ionicons name="pricetag" size={16} color="#A61C14" />
                  <Text className="text-[#1C1917] font-bold ml-2" numberOfLines={1}>
                    {appliedPromo.code} applied
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setAppliedPromo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={22} color="#78716C" />
                </TouchableOpacity>
              </View>
            ) : (
              <View className="flex-row">
                <TextInput
                  className="bg-white border border-stone-300 p-3 rounded-lg flex-1 mr-2 text-base text-[#1C1917]"
                  placeholder="Enter code"
                  placeholderTextColor="#A8A29E"
                  autoCapitalize="characters"
                  value={promoCode}
                  onChangeText={setPromoCode}
                />
                <TouchableOpacity
                  onPress={handleApplyPromo}
                  disabled={applyingPromo || !promoCode.trim()}
                  className={`px-5 rounded-lg items-center justify-center ${
                    applyingPromo || !promoCode.trim() ? 'bg-stone-300' : 'bg-[#1C1917]'
                  }`}
                >
                  {applyingPromo ? (
                    <ActivityIndicator size="small" color="#F4ECE1" />
                  ) : (
                    <Text className={`font-bold ${!promoCode.trim() ? 'text-stone-500' : 'text-[#F4ECE1]'}`}>Apply</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
        {/* Registered users already picked this at signup (editable from
            Edit Profile) -- re-asking at checkout every time is friction for
            a decision they already made. Guests have no profile to default
            from, so it's asked here instead. */}
        {items.length > 0 && isAnonymous && (
          <NotifyPreferenceToggle
            notifyEmail={notifyEmail}
            notifySms={notifySms}
            onChangeEmail={setNotifyEmail}
            onChangeSms={setNotifySms}
          />
        )}

        {/* A committed clock time beats an open-ended "~15-20 min" estimate
            -- uncertain waits invite repeated app-checking and in-person
            "is it ready yet" queue pressure that an exact time avoids. A
            dropdown rather than a row of chips, since getPickupSlots now
            offers every 15-minute slot up to closing (e.g. ordering at noon
            can still pick 8pm), not just the next couple hours. */}
        {items.length > 0 && (
          <View className="my-4 p-4 bg-white rounded-2xl border border-stone-200 shadow-sm">
            <Text className="text-lg font-bold mb-3 text-[#1C1917]">
              {orderType === 'delivery' ? 'When should it arrive?' : 'When would you like it?'}
            </Text>
            <TouchableOpacity
              onPress={() => setTimePickerVisible(true)}
              className="flex-row items-center justify-between bg-[#FAF6F0] border border-stone-300 rounded-xl px-4 py-3.5"
            >
              <Text className="font-bold text-[#1C1917]">
                {selectedSlot
                  ? selectedSlot.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                  : `ASAP (~${estimateReadyMinutes(orderType, itemCount)} min)`}
              </Text>
              <Ionicons name="chevron-down" size={18} color="#78716C" />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {items.length > 0 && (
        <View className="p-4 border-t border-stone-200 bg-[#FAF6F0]">
          <View className="flex-row justify-between mb-2">
            <Text className="text-lg text-[#78716C]">Order Type</Text>
            <Text className="text-lg font-bold uppercase text-[#1C1917]">{orderType}</Text>
          </View>
          <View className="flex-row justify-between mb-2">
            <Text className="text-lg text-[#78716C]">{orderType === 'delivery' ? 'Arriving' : 'Ready'}</Text>
            <Text className="text-lg font-bold text-[#1C1917]">
              {selectedSlot
                ? selectedSlot.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                : `ASAP (~${estimateReadyMinutes(orderType, itemCount)} min)`}
            </Text>
          </View>
          {orderType === 'delivery' && (
            <View className="mb-4">
              <Text className="text-sm text-[#78716C]">Delivering to:</Text>
              <Text className="text-md font-bold text-[#1C1917]" numberOfLines={2}>{deliveryAddress}</Text>
            </View>
          )}
          <View className="flex-row justify-between mb-1">
            <Text className="text-base text-[#78716C]">Subtotal</Text>
            <Text className="text-base text-[#1C1917]">${cartTotal.toFixed(2)}</Text>
          </View>
          {discountAmount > 0 && (
            <View className="flex-row justify-between mb-1">
              <Text className="text-base text-green-700">Discount ({appliedPromo?.code})</Text>
              <Text className="text-base text-green-700">-${discountAmount.toFixed(2)}</Text>
            </View>
          )}
          <View className="flex-row justify-between mb-2">
            <Text className="text-base text-[#78716C]">Tax</Text>
            <Text className="text-base text-[#1C1917]">${taxAmount.toFixed(2)}</Text>
          </View>
          <View className="flex-row justify-between mb-6 pt-2 border-t border-stone-200">
            <Text className="text-2xl font-bold text-[#1C1917]">Total</Text>
            <Text className="text-2xl font-bold text-[#A61C14]">
              ${grandTotal.toFixed(2)}
            </Text>
          </View>
          <TouchableOpacity
            className={`p-4 rounded-xl items-center shadow-md ${
              isAnonymous && !emailVerified ? 'bg-stone-300' : 'bg-[#A61C14] active:bg-[#85140E]'
            }`}
            onPress={handleCheckout}
            disabled={isSubmitting || (isAnonymous && !emailVerified)}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#F4ECE1" />
            ) : (
              <Text className={`text-xl font-bold ${isAnonymous && !emailVerified ? 'text-stone-500' : 'text-[#F4ECE1]'}`}>
                {isAnonymous && !emailVerified ? 'Verify Email to Continue' : 'Place Order'}
              </Text>
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