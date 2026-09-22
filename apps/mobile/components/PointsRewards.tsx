import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';

// Mirrors the tiers in redeem_points_reward() (see the panino_points
// migration) purely for display -- the server is the source of truth on
// cost and what each tier actually grants. Kept deliberately low-friction
// (a beverage at 300 pts = $30 spent, not a single high threshold) so the
// first reward is reachable within a customer's first few visits rather
// than requiring loyalty before showing any payoff.
const REWARD_TIERS: { tier: string; cost: number; title: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { tier: 'beverage', cost: 300, title: 'Free Beverage', icon: 'cafe-outline' },
  { tier: 'specialty_side', cost: 600, title: 'Free Specialty Side', icon: 'fast-food-outline' },
  { tier: 'sandwich', cost: 1200, title: 'Free Signature Sandwich', icon: 'restaurant-outline' },
];

// Purely a tier-display + "spend the points" component -- picking which
// specific item the resulting code redeems for (a possible multi-choice
// picker overlay) is handled by the parent screen, since that overlay needs
// to render at the screen's root to cover the full screen rather than be
// boxed into this card (see profile.tsx's handlePointsRedeemed).
export default function PointsRewards({
  points,
  onRedeemed,
}: {
  points: number;
  onRedeemed: (code: string, pointsSpent: number) => void;
}) {
  const [redeeming, setRedeeming] = useState<string | null>(null);

  const handleRedeem = async (tier: string, cost: number) => {
    setRedeeming(tier);
    try {
      const { data, error } = await (supabase as any).rpc('redeem_points_reward', { p_tier: tier });
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // pointsSpent comes straight from the RPC response so the parent can
      // reflect the new balance (and every tier's progress bar) the instant
      // this resolves, instead of waiting on a refetch round-trip.
      onRedeemed(data.code, data.pointsSpent);
    } catch (e: any) {
      Alert.alert("Couldn't redeem", e.message);
    } finally {
      setRedeeming(null);
    }
  };

  return (
    <View className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 mb-4">
      <View className="flex-row items-center justify-between mb-4">
        <Text className="text-lg font-inter-bold text-[#1C1917]">PaninoPoints</Text>
        <Text className="text-[#A61C14] font-inter-extrabold text-lg">{points}</Text>
      </View>
      {REWARD_TIERS.map(({ tier, cost, title, icon }) => {
        const canRedeem = points >= cost;
        const progress = Math.min(points / cost, 1);
        return (
          <View key={tier} className="mb-4">
            <View className="flex-row items-center justify-between mb-1.5">
              <View className="flex-row items-center flex-1 mr-2">
                <Ionicons name={icon} size={16} color="#A61C14" />
                <Text className="text-[#1C1917] font-inter-semibold ml-2" numberOfLines={1}>{title}</Text>
              </View>
              <Text className="text-[#78716C] text-xs font-inter-bold">{Math.min(points, cost)} / {cost}</Text>
            </View>
            <View className="h-2 bg-stone-100 rounded-full overflow-hidden mb-2">
              <View
                className={`h-full rounded-full ${canRedeem ? 'bg-[#A61C14]' : 'bg-stone-300'}`}
                style={{ width: `${progress * 100}%` }}
              />
            </View>
            {canRedeem && (
              <TouchableOpacity
                onPress={() => handleRedeem(tier, cost)}
                disabled={redeeming !== null}
                className={`py-2.5 rounded-lg items-center ${
                  redeeming === tier ? 'bg-stone-300' : 'bg-[#A61C14] active:bg-[#85140E]'
                }`}
              >
                {redeeming === tier ? (
                  <ActivityIndicator size="small" color="#F4ECE1" />
                ) : (
                  <Text className="text-[#F4ECE1] font-inter-bold text-sm">Redeem</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
}
