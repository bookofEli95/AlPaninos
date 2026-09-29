import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// The icon and message sit together in the middle of the banner. The icon
// is centred against the text, and the text drops Android's extra font
// padding -- otherwise the words sit a little higher than the icon.
export default function ErrorBanner({ message }: { message: string }) {
  return (
    <View className="flex-row items-center justify-center bg-[#FBE9E7] border border-[#F0B4AC] rounded-xl p-4 mb-4">
      <Ionicons name="alert-circle" size={20} color="#A61C14" style={{ marginRight: 8 }} />
      <Text
        className="text-[#A61C14] font-inter-medium text-sm text-center"
        style={{ flexShrink: 1, includeFontPadding: false, textAlignVertical: 'center' }}
      >
        {message}
      </Text>
    </View>
  );
}
