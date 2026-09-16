import { useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useCartStore } from '../../store/cartStore';
import AddressAutocomplete from '../../components/AddressAutocomplete';

export default function Home() {
  const router = useRouter();
  const { session, setSession } = useAuthStore();
  const { orderType, setOrderType, deliveryAddress, setDeliveryAddress } = useCartStore();

  useEffect(() => {
    const loadProfile = async () => {
      if (session?.user?.id) {
        const { data, error } = await (supabase as any)
          .from('profiles')
          .select('address')
          .eq('id', session.user.id)
          .single();
        if (error) {
          console.warn('Failed to load saved address:', error.message);
          return;
        }
        if (data?.address && !deliveryAddress) {
          setDeliveryAddress(data.address);
        }
      }
    };
    loadProfile();
  }, [session]);

  const { data: locations, isLoading, error: locationsError } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const { data, error } = await supabase.from('locations').select('*').order('name');
      if (error) throw error;
      return data;
    }
  });
  
  const handleSignOut = async () => {
    await supabase.auth.signOut().catch(console.warn);
    setSession(null);
    router.replace('/(auth)/login');
  };

  return (
    <View className="flex-1 bg-[#FAF6F0] px-4 pt-16">
      {/* Header aligned to pt-16 mb-6 */}
      <View style={styles.headerContainer}>
        <Text className="text-3xl font-extrabold text-[#1C1917]">Start Order</Text>
        <TouchableOpacity 
          onPress={handleSignOut}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          activeOpacity={0.6}
          style={styles.signOutButton}
        >
          <Text className="text-[#A61C14] font-bold text-base">Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Pickup / Delivery Toggle */}
      <View style={styles.toggleContainer}>
        <TouchableOpacity 
          onPress={() => setOrderType('pickup')}
          style={[styles.toggleButton, orderType === 'pickup' && styles.activeButton]}
        >
          <Text style={[styles.toggleText, orderType === 'pickup' && styles.activeText]}>Pickup</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          onPress={() => setOrderType('delivery')}
          style={[styles.toggleButton, orderType === 'delivery' && styles.activeButton]}
        >
          <Text style={[styles.toggleText, orderType === 'delivery' && styles.activeText]}>Delivery</Text>
        </TouchableOpacity>
      </View>

      {orderType === 'delivery' && (
        <View style={{ marginBottom: 16, zIndex: 50 }}>
          <Text style={{ color: '#1C1917', fontWeight: 'bold', marginBottom: 8 }}>Delivering to:</Text>
          <AddressAutocomplete 
            defaultAddress={deliveryAddress}
            onAddressSelect={setDeliveryAddress}
          />
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator size="large" color="#A61C14" className="mt-10" />
      ) : locationsError ? (
        <View className="mt-10 items-center px-6">
          <Text className="text-[#A61C14] font-bold text-lg mb-2">Couldn't load locations</Text>
          <Text className="text-[#78716C] text-center">{(locationsError as Error).message}</Text>
        </View>
      ) : (
        <FlatList
          data={locations}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity 
              onPress={() => router.push(`/(main)/menu/${item.id}`)}
              className="bg-white p-6 rounded-2xl mb-4 border border-stone-200 shadow-sm"
            >
              <Text className="text-xl font-bold text-[#1C1917]">{item.name}</Text>
              <Text className="text-[#78716C] mt-1">{item.address}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24, // Matches Tailwind mb-6 (24px)
    zIndex: 10,
  },
  signOutButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#E7E5E4',
    padding: 4,
    borderRadius: 12,
    marginBottom: 16,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  activeButton: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleText: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#78716C',
  },
  activeText: {
    color: '#A61C14',
  },
});