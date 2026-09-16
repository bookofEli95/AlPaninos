import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';

export default function MainLayout() {
  const { session } = useAuthStore();
  const isAnonymous = session?.user?.is_anonymous ?? false;

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
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: ({ color }) => <Ionicons name="receipt" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <Ionicons name="person" size={24} color={color} />,
          href: isAnonymous ? null : undefined,
        }}
      />

      {/* Hidden screens */}
      <Tabs.Screen name="cart" options={{ href: null }} />
      <Tabs.Screen name="menu/[id]" options={{ href: null }} />
      <Tabs.Screen name="item/[id]" options={{ href: null }} />
      <Tabs.Screen name="order/[id]" options={{ href: null }} />
    </Tabs>
  );
}