import { useEffect } from 'react';
import { View, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useLocationStore } from '../../store/locationStore';

// Tab shown to guests in place of Orders. Signing out of an anonymous
// session is irreversible -- there's no way to log back into it -- so this
// confirms first rather than doing it the instant the tab is tapped, and
// nudges toward creating an account since that's the only way to keep
// order history past this session.
export default function GuestExit() {
  const router = useRouter();
  const setSession = useAuthStore(state => state.setSession);
  const locationId = useLocationStore(state => state.locationId);

  useEffect(() => {
    const goBack = () => router.replace(locationId ? `/(main)/menu/${locationId}` : '/(main)');

    Alert.alert(
      'End Guest Session?',
      "Signing out ends this guest session for good -- any orders you've placed as a guest won't be viewable again afterward. Create an account instead if you want to keep your order history.",
      [
        { text: 'Cancel', style: 'cancel', onPress: goBack },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await supabase.auth.signOut().catch(console.warn);
            setSession(null);
            router.replace('/(auth)/login');
          },
        },
      ],
      { cancelable: false }
    );
  }, []);

  return (
    <View className="flex-1 bg-[#FAF6F0] justify-center items-center">
      <ActivityIndicator size="large" color="#A61C14" />
    </View>
  );
}
