import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { REFERRAL_AMOUNT, REFERRAL_MIN_ORDER, shareReferral, useMyReferral } from '../lib/referrals';

// "Give $5, Get $5" -- the customer's own code to share. The full card sits
// on Profile; `compact` is a one-line version for Deals. Accounts only
// (guests have no code), and hidden if the code can't be loaded.
export default function ReferralCard({ compact = false }: { compact?: boolean }) {
  const { data: referral, isLoading } = useMyReferral();
  const [copied, setCopied] = useState(false);

  if (!referral?.code) {
    return isLoading && !compact ? (
      <View className="bg-white rounded-3xl border border-stone-200 p-5 mt-4 items-center">
        <ActivityIndicator color="#A61C14" />
      </View>
    ) : null;
  }

  const handleShare = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    shareReferral(referral.code);
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(referral.code);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (compact) {
    return (
      <TouchableOpacity
        onPress={handleShare}
        activeOpacity={0.85}
        className="bg-[#1C1917] rounded-2xl flex-row items-center px-4 py-3 mb-4"
      >
        <View className="w-10 h-10 rounded-full bg-[#FFC72C] items-center justify-center mr-3">
          <Ionicons name="people" size={19} color="#7A0E0A" />
        </View>
        <View className="flex-1 mr-2">
          <Text className="text-[#FFC72C] font-inter-extrabold text-sm">
            Give ${REFERRAL_AMOUNT}, Get ${REFERRAL_AMOUNT}
          </Text>
          <Text className="text-[#F4ECE1] text-[13px] font-inter-medium opacity-90" numberOfLines={1}>
            Share your code <Text className="font-inter-extrabold tracking-wider">{referral.code}</Text> with a friend
          </Text>
        </View>
        <Ionicons name="share-outline" size={20} color="#FFC72C" />
      </TouchableOpacity>
    );
  }

  const earned = referral.friends_ordered * REFERRAL_AMOUNT;

  return (
    <View className="bg-white rounded-3xl border border-stone-200 shadow-sm p-5 mt-4">
      <View className="flex-row items-center mb-2">
        <View className="w-11 h-11 rounded-full bg-[#A61C14] items-center justify-center mr-3">
          <Ionicons name="people" size={20} color="#FFC72C" />
        </View>
        <View className="flex-1">
          <Text className="text-[11px] font-inter-extrabold text-[#A61C14] uppercase tracking-wider">
            Give ${REFERRAL_AMOUNT}, Get ${REFERRAL_AMOUNT}
          </Text>
          <Text className="text-lg font-inter-bold text-[#1C1917] leading-6">Treat a friend to Al Paninos</Text>
        </View>
      </View>

      <Text className="text-stone-600 text-sm leading-5 mb-4">
        Friends get ${REFERRAL_AMOUNT} off their first order of ${REFERRAL_MIN_ORDER}+ with your code. When they pick it
        up, you get ${REFERRAL_AMOUNT} off too.
      </Text>

      <View className="flex-row items-stretch" style={{ gap: 10 }}>
        <TouchableOpacity
          onPress={handleCopy}
          activeOpacity={0.8}
          accessibilityLabel={`Copy your code ${referral.code}`}
          className="flex-1 flex-row items-center justify-center border-2 border-dashed border-[#A61C14] rounded-xl bg-[#FAF6F0] py-2.5"
        >
          <Text className="text-[#A61C14] font-inter-extrabold text-lg tracking-widest mr-2">{referral.code}</Text>
          <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color="#A61C14" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleShare}
          activeOpacity={0.85}
          className="flex-row items-center bg-[#A61C14] rounded-xl px-5 active:bg-[#85140E]"
        >
          <Ionicons name="share-outline" size={17} color="#F4ECE1" />
          <Text className="text-[#F4ECE1] font-inter-bold text-base ml-1.5">Share</Text>
        </TouchableOpacity>
      </View>

      <Text className="text-[#78716C] text-xs font-inter-medium mt-3 text-center">
        {copied
          ? 'Copied!'
          : referral.friends_joined > 0
            ? `${referral.friends_joined} ${referral.friends_joined === 1 ? 'friend has' : 'friends have'} used your code` +
              (earned > 0 ? ` · $${earned} earned` : '')
            : 'Tap the code to copy it'}
      </Text>
    </View>
  );
}
