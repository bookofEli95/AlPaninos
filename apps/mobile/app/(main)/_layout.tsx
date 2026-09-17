import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { useLocationStore } from '../../store/locationStore';

export default function MainLayout() {
  const { session } = useAuthStore();
  const isAnonymous = session?.user?.is_anonymous ?? false;
  const { locationId, isLoaded, loadSavedLocation } = useLocationStore();

  useEffect(() => {
    if (!isLoaded) loadSavedLocation();
  }, [isLoaded]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#A61C14',
        tabBarInactiveTintColor: '#78716C',
        tabBarStyle: {
          backgroundColor: '#FAF6F0',
          borderTopColor: '#E7E5E4',
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <Ionicons name="person" size={24} color={color} />,
          href: isAnonymous ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="menu/[id]"
        options={{
          title: 'Menu',
          tabBarIcon: ({ color }) => <Ionicons name="restaurant" size={24} color={color} />,
          href: locationId ? { pathname: '/(main)/menu/[id]', params: { id: locationId } } : null,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: ({ color }) => <Ionicons name="receipt" size={24} color={color} />,
          // Guest sessions are anonymous Supabase users, not throwaway --
          // the session (and its orders) persists until they explicitly
          // sign out via the guest-exit tab, so tracking works the same as
          // for registered users.
        }}
      />
      <Tabs.Screen
        name="guest-exit"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Ionicons name="home-outline" size={24} color={color} />,
          href: isAnonymous ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Change Location',
          tabBarIcon: ({ color }) => <Ionicons name="location" size={24} color={color} />,
        }}
      />

      {/* Hidden screens */}
      <Tabs.Screen name="cart" options={{ href: null }} />
      <Tabs.Screen name="item/[id]" options={{ href: null }} />
      <Tabs.Screen name="order/[id]" options={{ href: null }} />
      <Tabs.Screen name="edit-profile" options={{ href: null }} />
    </Tabs>
  );
}
