import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';

// Tab shown to guests in place of Orders (guests have no reliable order
// history -- it's tied to a throwaway anonymous session). Tapping it signs
// out and returns to login so they can log in for real or start a fresh
// guest session.
export default function GuestExit() {
  const router = useRouter();
  const setSession = useAuthStore(state => state.setSession);

  useEffect(() => {
    (async () => {
      await supabase.auth.signOut().catch(console.warn);
      setSession(null);
      router.replace('/(auth)/login');
    })();
  }, []);

  return (
    <View className="flex-1 bg-[#FAF6F0] justify-center items-center">
      <ActivityIndicator size="large" color="#A61C14" />
    </View>
  );
}
