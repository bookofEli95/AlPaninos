import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  notifyEmail: boolean;
  notifySms: boolean;
  onChangeEmail: (value: boolean) => void;
  onChangeSms: (value: boolean) => void;
  label?: string;
};

export default function NotifyPreferenceToggle({
  notifyEmail,
  notifySms,
  onChangeEmail,
  onChangeSms,
  label = 'Send order updates via',
}: Props) {
  return (
    <View className="mb-6">
      <Text className="text-[#1C1917] font-inter-bold mb-2">{label}</Text>
      <View className="flex-row">
        <TouchableOpacity
          onPress={() => onChangeEmail(!notifyEmail)}
          className={`flex-row items-center flex-1 mr-2 py-3 rounded-xl border ${
            notifyEmail ? 'bg-[#A61C14] border-[#A61C14]' : 'bg-white border-stone-300'
          } justify-center`}
        >
          <Ionicons name="mail" size={16} color={notifyEmail ? '#F4ECE1' : '#78716C'} />
          <Text className={`font-inter-bold ml-2 ${notifyEmail ? 'text-[#F4ECE1]' : 'text-[#78716C]'}`}>
            Email
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onChangeSms(!notifySms)}
          className={`flex-row items-center flex-1 ml-2 py-3 rounded-xl border ${
            notifySms ? 'bg-[#A61C14] border-[#A61C14]' : 'bg-white border-stone-300'
          } justify-center`}
        >
          <Ionicons name="chatbubble-ellipses" size={16} color={notifySms ? '#F4ECE1' : '#78716C'} />
          <Text className={`font-inter-bold ml-2 ${notifySms ? 'text-[#F4ECE1]' : 'text-[#78716C]'}`}>
            Text
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
