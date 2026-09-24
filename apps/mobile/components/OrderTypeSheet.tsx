import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Keyboard } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import AddressAutocomplete from './AddressAutocomplete';

type Props = {
  visible: boolean;
  onClose: () => void;
};

// Pickup / Delivery + delivery address, as a bottom sheet over the current
// screen. Shared by the menu's order-type pill and the cart's fulfillment
// strip, so the address can be set (or changed) from either place.
// Render it last inside a full-screen View -- it's an absolute overlay.
export default function OrderTypeSheet({ visible, onClose }: Props) {
  const { orderType, setOrderType, deliveryAddress, setDeliveryAddress } = useCartStore();
  const session = useAuthStore((state) => state.session);
  const isAnonymous = session?.user?.is_anonymous ?? false;
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Switching to delivery pre-fills a registered customer's saved address
  // (from their profile) when none is set yet. Guests have none saved.
  const handleSelectDelivery = async () => {
    setOrderType('delivery');
    if (deliveryAddress || isAnonymous || !session?.user?.id) return;
    const { data, error } = await (supabase as any)
      .from('profiles')
      .select('address')
      .eq('id', session.user.id)
      .single();
    if (error) {
      console.warn('Failed to load saved address:', error.message);
      return;
    }
    if (data?.address) setDeliveryAddress(data.address);
  };

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      <View style={{ marginBottom: keyboardHeight }}>
        <View className="bg-[#FAF6F0] rounded-t-3xl p-5" style={{ paddingBottom: 32 }}>
          <Text className="text-xl font-display-bold text-[#1C1917] tracking-tight mb-4">Order Type</Text>

          <View className="flex-row bg-[#E7E5E4] p-1 rounded-xl mb-4">
            <TouchableOpacity
              onPress={() => setOrderType('pickup')}
              className={`flex-1 py-3 rounded-lg items-center ${orderType === 'pickup' ? 'bg-white' : ''}`}
              style={orderType === 'pickup' ? styles.activeToggleShadow : undefined}
            >
              <Text className={`font-inter-bold text-sm ${orderType === 'pickup' ? 'text-[#A61C14]' : 'text-[#78716C]'}`}>
                Pickup
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSelectDelivery}
              className={`flex-1 py-3 rounded-lg items-center ${orderType === 'delivery' ? 'bg-white' : ''}`}
              style={orderType === 'delivery' ? styles.activeToggleShadow : undefined}
            >
              <Text className={`font-inter-bold text-sm ${orderType === 'delivery' ? 'text-[#A61C14]' : 'text-[#78716C]'}`}>
                Delivery
              </Text>
            </TouchableOpacity>
          </View>

          {orderType === 'delivery' && (
            <View className="mb-4">
              <Text className="text-[#1C1917] font-inter-bold text-sm mb-2">Delivering to:</Text>
              <AddressAutocomplete defaultAddress={deliveryAddress} onAddressSelect={setDeliveryAddress} clearOnFocus />
            </View>
          )}

          <TouchableOpacity
            onPress={onClose}
            className="bg-[#A61C14] rounded-xl py-3.5 items-center active:bg-[#85140E]"
          >
            <Text className="text-[#F4ECE1] font-inter-bold text-base">Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  // A style object (not a shadow class) because it toggles with the
  // selection -- see lib/shadows.ts.
  activeToggleShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
});
