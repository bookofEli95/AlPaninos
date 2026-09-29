import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// The icon is centred against the text (not pinned to the top of it), and
// the text drops Android's extra font padding -- otherwise the words sit a
// little higher than the middle of the icon.
export default function ErrorBanner({ message }: { message: string }) {
  return (
    <View className="flex-row items-center bg-[#FBE9E7] border border-[#F0B4AC] rounded-xl p-4 mb-4">
      <Ionicons name="alert-circle" size={20} color="#A61C14" style={{ marginRight: 8 }} />
      <Text
        className="flex-1 text-[#A61C14] font-inter-medium text-sm"
        style={{ includeFontPadding: false, textAlignVertical: 'center' }}
      >
        {message}
      </Text>
    </View>
  );
}
