import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function ErrorBanner({ message }: { message: string }) {
  return (
    <View className="flex-row items-start bg-[#FBE9E7] border border-[#F0B4AC] rounded-xl p-4 mb-4">
      <Ionicons name="alert-circle" size={20} color="#A61C14" style={{ marginRight: 8, marginTop: 1 }} />
      <Text className="flex-1 text-[#A61C14] font-inter-medium text-sm">{message}</Text>
    </View>
  );
}
