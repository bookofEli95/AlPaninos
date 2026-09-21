import { useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useLocationStore } from '../../store/locationStore';
import { usePromoStore } from '../../store/promoStore';
import { useBackHandler } from '../../hooks/useBackHandler';
import SkeletonBox from '../../components/Skeleton';

export default function DealsScreen() {
  const router = useRouter();
  const locationId = useLocationStore(state => state.locationId);
  const { appliedPromo, setAppliedPromo } = usePromoStore();
  const [toast, setToast] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const goBack = useCallback(() => {
    router.replace(locationId ? `/(main)/menu/${locationId}` : '/(main)');
  }, [locationId]);
  useBackHandler(goBack);

  const { data: promotions, isLoading, error } = useQuery({
    queryKey: ['promotions', locationId, 'all'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('promotions')
        .select('*')
        .eq('is_active', true)
        // Personal one-time codes (e.g. a wheel-won prize -- see the
        // spin_wheel migration) are surfaced from the Profile screen, not
        // mixed into this storewide deals feed.
        .is('user_id', null)
        .or(`location_id.eq.${locationId},location_id.is.null`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!locationId,
  });

  const showToast = (message: string) => {
    setToast(message);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.delay(1500),
      Animated.timing(toastOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setToast(null));
  };

  const handleTogglePromo = (item: any) => {
    if (!item.code) return;
    if (appliedPromo?.code === item.code) {
      setAppliedPromo(null);
      showToast('Promo removed');
      return;
    }
    setAppliedPromo({
      code: item.code,
      title: item.title,
      discountPercent: Number(item.discount_percent) || 0,
      categoryId: item.category_id,
      categoryName: item.category_name,
      itemNamePatterns: item.item_name_patterns,
      maxDiscountAmount: item.max_discount_amount != null ? Number(item.max_discount_amount) : null,
    });
    showToast('Promo applied');
  };

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-16 px-4">
      <View className="flex-row items-center mb-6">
        <TouchableOpacity
          onPress={goBack}
          className="flex-row items-center py-4 pr-8 -ml-2"
        >
          <Ionicons name="chevron-back" size={28} color="#A61C14" />
          <Text className="text-[#A61C14] font-bold text-xl">Back</Text>
        </TouchableOpacity>
        <Text className="text-2xl font-bold text-[#1C1917] ml-2">Deals</Text>
      </View>

      {isLoading ? (
        <View>
          {[1, 2].map(i => (
            <SkeletonBox key={i} height={110} borderRadius={16} style={{ marginBottom: 16 }} />
          ))}
        </View>
      ) : error ? (
        <View className="mt-10 items-center px-6">
          <Text className="text-[#A61C14] font-bold text-lg mb-2">Couldn't load deals</Text>
          <Text className="text-[#78716C] text-center">{(error as Error).message}</Text>
        </View>
      ) : (
        <FlatList
          data={promotions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isApplied = !!item.code && appliedPromo?.code === item.code;
            const card = (
              <View
                className={`bg-white rounded-2xl border shadow-sm p-5 mb-4 ${
                  isApplied ? 'border-[#A61C14]' : 'border-stone-200'
                }`}
              >
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-lg font-bold text-[#1C1917] flex-1 mr-2">{item.title}</Text>
                  {isApplied && <Ionicons name="checkmark-circle" size={22} color="#A61C14" />}
                </View>
                {item.description && (
                  <Text className="text-[#78716C] mb-3">{item.description}</Text>
                )}
                {item.code && (
                  <View
                    className={`self-start rounded-lg px-3 py-1.5 border ${
                      isApplied ? 'bg-[#A61C14] border-[#A61C14]' : 'bg-[#FAF6F0] border-stone-300'
                    }`}
                  >
                    <Text className={`font-bold tracking-wider ${isApplied ? 'text-[#F4ECE1]' : 'text-[#A61C14]'}`}>
                      {isApplied ? 'APPLIED -- TAP TO REMOVE' : `CODE: ${item.code}`}
                    </Text>
                  </View>
                )}
              </View>
            );

            return item.code ? (
              <TouchableOpacity onPress={() => handleTogglePromo(item)} activeOpacity={0.8}>
                {card}
              </TouchableOpacity>
            ) : (
              card
            );
          }}
          ListEmptyComponent={
            <Text className="text-center text-[#78716C] mt-10 text-base">No deals right now -- check back soon!</Text>
          }
        />
      )}

      {toast && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: 40,
            left: 24,
            right: 24,
            opacity: toastOpacity,
          }}
        >
          <View className="bg-[#1C1917] rounded-full py-3 px-5 items-center">
            <Text className="text-[#F4ECE1] font-bold">{toast}</Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}
