import { useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useLocationStore } from '../../store/locationStore';
import { useQuery } from '@tanstack/react-query';

type ProfileData = {
  first_name: string;
  last_name: string;
  phone: string;
  address: string;
};

export default function ProfileScreen() {
  const router = useRouter();
  const { session, setSession } = useAuthStore();
  const locationId = useLocationStore(state => state.locationId);
  const isAnonymous = session?.user?.is_anonymous ?? false;

  // Profile is hidden from guests' tab bar, but the route itself is still
  // reachable (e.g. the Android back gesture can land here regardless) --
  // there's nothing here for a guest, so bounce them out immediately.
  useEffect(() => {
    if (isAnonymous) {
      router.replace(locationId ? `/(main)/menu/${locationId}` : '/(main)');
    }
  }, [isAnonymous]);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) return null;
      const { data, error } = await (supabase as any)
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      if (error) throw error;
      return data as ProfileData;
    },
    enabled: !!session?.user?.id
  });

  const handleSignOut = async () => {
    await supabase.auth.signOut().catch(console.warn);
    setSession(null);
    router.replace('/(auth)/login');
  };

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-16 px-4">
      <Text className="text-3xl font-extrabold text-[#1C1917] mb-6">My Profile</Text>
      
      {isLoading ? (
        <ActivityIndicator size="large" color="#A61C14" className="mt-10" />
      ) : profile ? (
        <View className="mb-6 bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
          <Text className="text-xs text-[#78716C] uppercase font-bold tracking-wider mb-1">Name</Text>
          <Text className="text-lg font-bold text-[#1C1917] mb-4">{profile.first_name} {profile.last_name}</Text>

          <Text className="text-xs text-[#78716C] uppercase font-bold tracking-wider mb-1">Phone</Text>
          <Text className="text-lg font-bold text-[#1C1917] mb-4">{profile.phone}</Text>

          <Text className="text-xs text-[#78716C] uppercase font-bold tracking-wider mb-1">Address</Text>
          <Text className="text-lg font-bold text-[#1C1917] mb-4">{profile.address}</Text>
          
          <Text className="text-xs text-[#78716C] uppercase font-bold tracking-wider mb-1">Account Email</Text>
          <Text className="text-lg font-bold text-[#1C1917]">{session?.user?.email}</Text>
        </View>
      ) : (
        <Text className="text-[#78716C] mb-8 text-base">No profile data found.</Text>
      )}

      <TouchableOpacity 
        onPress={handleSignOut}
        className="bg-red-50 p-4 rounded-2xl w-full items-center border border-red-200 mt-auto mb-8 active:bg-red-100"
      >
        <Text className="text-[#A61C14] font-bold text-lg">Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}