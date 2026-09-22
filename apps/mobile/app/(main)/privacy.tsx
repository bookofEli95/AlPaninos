import { useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useBackHandler } from '../../hooks/useBackHandler';

// Generic placeholder copy -- have an actual lawyer review this before
// Al Paninos takes real orders/payments from the public.
const SECTIONS = [
  {
    heading: 'Information We Collect',
    body: 'When you create an account or place an order, we collect your name, email address, phone number, and delivery address. We also keep a record of your order history to make reordering easier.',
  },
  {
    heading: 'How We Use Your Information',
    body: 'We use your information to process orders, send order status updates by email, text, or push notification (based on your preferences), and improve our menu and service.',
  },
  {
    heading: 'Sharing Your Information',
    body: 'We do not sell your personal information. We share only what is necessary with payment processors and delivery partners to fulfill your order.',
  },
  {
    heading: 'Data Security',
    body: 'We take reasonable measures to protect your information, including encrypted storage and access controls limited to staff who need it to run the restaurant.',
  },
  {
    heading: 'Your Choices',
    body: 'You can update or delete your account information at any time from your profile, and can turn off push notifications from Settings.',
  },
  {
    heading: 'Contact Us',
    body: 'Questions about this policy? Reach us from the Customer Support page.',
  },
];

export default function PrivacyScreen() {
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
        <Text className="text-2xl font-inter-bold text-[#1C1917] ml-2">Privacy Policy</Text>
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
