import { useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useBackHandler } from '../hooks/useBackHandler';
import { useCartBarSpace } from '../hooks/useCartBarSpace';

const RED = '#A61C14';

export type InfoSection = { heading: string; body: string };

// A reading page reached from More (Privacy Policy, Terms & Legal): the
// title, a short intro, the sections numbered in one card, and a way to ask
// a question about it.
export default function InfoPage({
  title,
  icon,
  intro,
  sections,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  intro: string;
  sections: InfoSection[];
}) {
  const router = useRouter();
  const cartBarSpace = useCartBarSpace();

  const goBackToMore = useCallback(() => {
    router.replace('/(main)/more');
  }, [router]);
  useBackHandler(goBackToMore);

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-14">
      <View className="flex-row items-center px-4 mb-2">
        <TouchableOpacity
          onPress={goBackToMore}
          className="py-2 pr-2 -ml-2"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={28} color={RED} />
        </TouchableOpacity>
        <Text className="text-2xl font-display-bold text-[#1C1917] tracking-tight">{title}</Text>
      </View>

      <ScrollView
        className="flex-1 px-4"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: cartBarSpace + 32 }}
      >
        <View className="flex-row items-center bg-[#1C1917] rounded-2xl px-4 py-4 mb-4">
          <View className="w-11 h-11 rounded-full bg-[#A61C14] items-center justify-center mr-3">
            <Ionicons name={icon} size={20} color="#FFC72C" />
          </View>
          <Text className="flex-1 text-[#F4ECE1] text-sm leading-5 font-inter-medium">{intro}</Text>
        </View>

        <View className="bg-white rounded-2xl border border-stone-200 shadow-sm px-4">
          {sections.map((section, i) => (
            <View
              key={section.heading}
              className={`flex-row py-4 ${i < sections.length - 1 ? 'border-b border-stone-100' : ''}`}
            >
              <View className="w-6 h-6 rounded-full bg-[#FAF6F0] border border-stone-200 items-center justify-center mr-3 mt-0.5">
                <Text className="text-[11px] font-inter-extrabold text-[#A61C14]">{i + 1}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-[15px] font-inter-bold text-[#1C1917] mb-1">{section.heading}</Text>
                <Text className="text-sm text-stone-600 leading-[22px]">{section.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity
          onPress={() => router.push('/(main)/customer-support')}
          activeOpacity={0.8}
          className="flex-row items-center justify-between bg-white rounded-2xl border border-stone-200 px-4 py-3.5 mt-4"
        >
          <View className="flex-row items-center flex-1">
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={RED} />
            <Text className="text-sm font-inter-semibold text-[#1C1917] ml-2.5">Questions? Contact Customer Support</Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color="#A8A29E" />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
