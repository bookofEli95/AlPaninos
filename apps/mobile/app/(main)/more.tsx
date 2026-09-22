import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const MENU_ITEMS = [
  { label: 'Change Location', icon: 'location-outline', route: '/(main)' },
  { label: 'Settings', icon: 'settings-outline', route: '/(main)/settings' },
  { label: 'Customer Support', icon: 'help-buoy-outline', route: '/(main)/customer-support' },
  { label: 'Privacy', icon: 'shield-checkmark-outline', route: '/(main)/privacy' },
  { label: 'Legal', icon: 'document-text-outline', route: '/(main)/legal' },
];

export default function MoreScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-16 px-4">
      <Text className="text-3xl font-inter-extrabold text-[#1C1917] mb-6">More</Text>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          {MENU_ITEMS.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              onPress={() => router.push(item.route as any)}
              className={`flex-row items-center justify-between p-4 ${
                index < MENU_ITEMS.length - 1 ? 'border-b border-stone-100' : ''
              }`}
            >
              <View className="flex-row items-center">
                <Ionicons name={item.icon as any} size={20} color="#A61C14" style={{ width: 28 }} />
                <Text className="text-base font-inter-semibold text-[#1C1917]">{item.label}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#A8A29E" />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
