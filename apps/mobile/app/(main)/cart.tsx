import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Keyboard } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useCartStore, CartItem } from '../../store/cartStore';
import { useAuthStore } from '../../store/authStore';
import NotifyPreferenceToggle from '../../components/NotifyPreferenceToggle';
import { isValidEmail } from '../../lib/passwordStrength';

export default function CartScreen() {
  const router = useRouter();
  const { items, locationId, removeItem, clearCart, orderType, deliveryAddress } = useCartStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { session } = useAuthStore();
  const isAnonymous = session?.user?.is_anonymous ?? false;

  const [guestFirstName, setGuestFirstName] = useState('');
  const [guestLastName, setGuestLastName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifySms, setNotifySms] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const cartTotal = items.reduce((sum: number, item: CartItem) => sum + item.totalPrice, 0);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Registered users set a default notification preference on their profile
  // (register.tsx / edit-profile.tsx) -- prefill it here so they don't have
  // to re-pick it on every order, though they can still adjust it per order.
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
    if (!notifyEmail && !notifySms) {
      Alert.alert('Notification Preference', 'Choose at least one way to receive order updates.');
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      let customerName = `${guestFirstName.trim()} ${guestLastName.trim()}`;
      let customerPhone = guestPhone.trim();

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
          total_amount: cartTotal,
          status: 'received',
          order_type: orderType,
          delivery_address: orderType === 'delivery' ? deliveryAddress : null
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

      clearCart();
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
    <View className="flex-1 bg-white pt-12">
      <View className="flex-row items-center justify-between px-4 mb-4">
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => router.replace(locationId ? `/(main)/menu/${locationId}` : '/(main)')}
            className="flex-row items-center py-4 pr-8 -ml-2"
          >
            <Ionicons name="chevron-back" size={28} color="#dc2626" />
            <Text className="text-red-600 font-bold text-xl">Back</Text>
          </TouchableOpacity>
          <Text className="text-2xl font-bold ml-2">Cart</Text>
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
            <Text className="text-gray-500 font-bold text-base">Clear</Text>
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
          <View key={item.cartItemId} className="py-4 border-b border-gray-100">
            <View className="flex-row justify-between items-start mb-2">
              <View className="flex-1 pr-4">
                <Text className="text-lg font-bold">
                  {item.quantity}x {item.name}
                </Text>
                {item.modifiers.map(mod => (
                  <Text key={mod.optionId} className="text-gray-500 text-sm mt-1">
                    + {mod.name} {mod.price > 0 ? `($${mod.price.toFixed(2)})` : ''}
                  </Text>
                ))}
                {item.specialInstructions && (
                  <Text className="text-gray-500 text-sm mt-1 italic">
                    Note: {item.specialInstructions}
                  </Text>
                )}
              </View>
              <Text className="text-lg font-bold text-red-600">
                ${item.totalPrice.toFixed(2)}
              </Text>
            </View>
            <TouchableOpacity 
              onPress={() => removeItem(item.cartItemId)}
              className="self-start mt-2"
            >
              <Text className="text-red-500 font-bold">Remove</Text>
            </TouchableOpacity>
          </View>
        ))}
        {items.length === 0 && (
          <Text className="text-center text-gray-500 mt-10">Your cart is empty</Text>
        )}
        {items.length > 0 && isAnonymous && (
          <View className="my-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <Text className="text-lg font-bold mb-3 text-gray-900">Contact Details</Text>
            
            <View className="flex-row justify-between mb-3">
              <TextInput
                className="bg-white border border-gray-300 p-3 rounded-lg flex-1 mr-2 text-base"
                placeholder="First Name"
                value={guestFirstName}
                onChangeText={setGuestFirstName}
              />
              <TextInput
                className="bg-white border border-gray-300 p-3 rounded-lg flex-1 ml-2 text-base"
                placeholder="Last Name"
                value={guestLastName}
                onChangeText={setGuestLastName}
              />
            </View>

            <TextInput
              className="bg-white border border-gray-300 p-3 rounded-lg text-base mb-3"
              placeholder="Phone Number"
              keyboardType="phone-pad"
              value={guestPhone}
              onChangeText={setGuestPhone}
            />

            <TextInput
              className="bg-white border border-gray-300 p-3 rounded-lg text-base"
              placeholder="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={guestEmail}
              onChangeText={setGuestEmail}
            />
          </View>
        )}
        {items.length > 0 && (
          <NotifyPreferenceToggle
            notifyEmail={notifyEmail}
            notifySms={notifySms}
            onChangeEmail={setNotifyEmail}
            onChangeSms={setNotifySms}
          />
        )}
      </ScrollView>

      {items.length > 0 && (
        <View className="p-4 border-t border-gray-200">
          <View className="flex-row justify-between mb-2">
            <Text className="text-lg text-gray-600">Order Type</Text>
            <Text className="text-lg font-bold uppercase">{orderType}</Text>
          </View>
          {orderType === 'delivery' && (
            <View className="mb-4">
              <Text className="text-sm text-gray-500">Delivering to:</Text>
              <Text className="text-md font-bold" numberOfLines={2}>{deliveryAddress}</Text>
            </View>
          )}
          <View className="flex-row justify-between mb-6">
            <Text className="text-2xl font-bold">Total</Text>
            <Text className="text-2xl font-bold text-red-600">
              ${cartTotal.toFixed(2)}
            </Text>
          </View>
          <TouchableOpacity
            className={`p-4 rounded-xl items-center ${isSubmitting ? 'bg-red-400' : 'bg-red-600'}`}
            onPress={handleCheckout}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white text-xl font-bold">Place Order</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}