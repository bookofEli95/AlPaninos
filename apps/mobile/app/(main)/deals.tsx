import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useLocationStore } from '../../store/locationStore';
import SkeletonBox from '../../components/Skeleton';

export default function DealsScreen() {
  const router = useRouter();
  const locationId = useLocationStore(state => state.locationId);

  const { data: promotions, isLoading, error } = useQuery({
    queryKey: ['promotions', locationId, 'all'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('promotions')
        .select('*')
        .eq('is_active', true)
        .or(`location_id.eq.${locationId},location_id.is.null`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!locationId,
  });

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-16 px-4">
      <View className="flex-row items-center mb-6">
        <TouchableOpacity
          onPress={() => router.replace(locationId ? `/(main)/menu/${locationId}` : '/(main)')}
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
          renderItem={({ item }) => (
            <View className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 mb-4">
              <Text className="text-lg font-bold text-[#1C1917] mb-1">{item.title}</Text>
              {item.description && (
                <Text className="text-[#78716C] mb-3">{item.description}</Text>
              )}
              {item.code && (
                <View className="self-start bg-[#FAF6F0] border border-stone-300 rounded-lg px-3 py-1.5">
                  <Text className="text-[#A61C14] font-bold tracking-wider">CODE: {item.code}</Text>
                </View>
              )}
            </View>
          )}
          ListEmptyComponent={
            <Text className="text-center text-[#78716C] mt-10 text-base">No deals right now -- check back soon!</Text>
          }
        />
      )}
    </View>
  );
}
