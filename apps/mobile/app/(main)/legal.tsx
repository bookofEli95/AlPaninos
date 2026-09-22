import { useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useBackHandler } from '../../hooks/useBackHandler';

// Generic placeholder copy -- have an actual lawyer review this before
// Al Paninos takes real orders/payments from the public.
const SECTIONS = [
  {
    heading: 'Acceptance of Terms',
    body: 'By using the Al Paninos app, you agree to these terms. If you do not agree, please do not use the app.',
  },
  {
    heading: 'Orders and Payment',
    body: 'All orders are subject to availability and confirmation by the restaurant. Prices shown include applicable tax. Orders may be cancelled by the restaurant if items become unavailable.',
  },
  {
    heading: 'Cancellations and Refunds',
    body: 'To cancel or request a refund for an order, contact us as soon as possible from the Customer Support page. Once an order has entered preparation, a refund may not be possible.',
  },
  {
    heading: 'Account Responsibility',
    body: 'You are responsible for keeping your account information accurate and your login credentials secure.',
  },
  {
    heading: 'Limitation of Liability',
    body: 'Al Paninos is not liable for indirect or incidental damages arising from use of this app, to the extent permitted by law.',
  },
  {
    heading: 'Changes to These Terms',
    body: 'We may update these terms from time to time. Continued use of the app after changes means you accept the updated terms.',
  },
];

export default function LegalScreen() {
  const router = useRouter();

  const goBackToMore = useCallback(() => {
    router.replace('/(main)/more');
  }, []);
  useBackHandler(goBackToMore);

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-16 px-4">
      <View className="flex-row items-center mb-6">
        <TouchableOpacity onPress={goBackToMore} className="flex-row items-center py-4 pr-8 -ml-2">
          <Ionicons name="chevron-back" size={28} color="#A61C14" />
          <Text className="text-[#A61C14] font-inter-bold text-xl">Back</Text>
        </TouchableOpacity>
        <Text className="text-2xl font-inter-bold text-[#1C1917] ml-2">Legal</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {SECTIONS.map((section) => (
          <View key={section.heading} className="mb-5">
            <Text className="text-base font-inter-bold text-[#1C1917] mb-1">{section.heading}</Text>
            <Text className="text-[#78716C] leading-6">{section.body}</Text>
          </View>
        ))}
        <View className="mb-12" />
      </ScrollView>
    </View>
  );
}
