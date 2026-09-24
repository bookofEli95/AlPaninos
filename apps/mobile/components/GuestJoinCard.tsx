import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const PERKS = [
  { icon: 'color-wand-outline', text: 'A free spin on the welcome prize wheel' },
  { icon: 'gift-outline', text: '10 PaninoPoints per $1 toward free drinks, sides and sandwiches' },
  { icon: 'receipt-outline', text: 'Your order history and receipts, on any device' },
];

// "Create an account, keep your cart" -- shown to guests on More and on the
// Profile tab (which guests see too, so the tab bar never changes shape
// when a guest becomes a member).
export default function GuestJoinCard({ onCreate, onSignIn }: { onCreate: () => void; onSignIn: () => void }) {
  return (
    <View className="bg-white rounded-3xl p-5 border border-stone-200 shadow-sm mb-4">
      <View className="flex-row items-center mb-2">
        <View className="w-8 h-8 rounded-full bg-[#FAF6F0] items-center justify-center mr-2.5 border border-stone-200">
          <Ionicons name="sparkles" size={16} color="#A61C14" />
        </View>
        <View className="flex-1">
          <Text className="text-[11px] font-inter-bold text-[#A61C14] uppercase tracking-wider">Guest Session</Text>
          <Text className="text-base font-inter-bold text-[#1C1917]">Create an Account, Keep Your Cart</Text>
        </View>
      </View>

      <Text className="text-stone-600 text-xs leading-4 mb-3">It takes a minute, your cart comes with you, and you unlock:</Text>

      <View className="mb-3.5 gap-1.5">
        {PERKS.map((perk) => (
          <View key={perk.text} className="flex-row items-center">
            <Ionicons name={perk.icon as any} size={14} color="#A61C14" />
            <Text className="text-stone-600 text-xs ml-2 font-inter-medium flex-1">{perk.text}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        onPress={onCreate}
        className="bg-[#A61C14] py-3 rounded-xl items-center shadow-sm active:bg-[#85140E] mb-2"
      >
        <Text className="text-[#F4ECE1] font-inter-bold text-xs">Create Free Account</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onSignIn} className="py-1.5 items-center">
        <Text className="text-stone-500 text-xs font-inter-semibold">
          Already have an account? <Text className="text-[#A61C14] underline">Sign In</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );
}
