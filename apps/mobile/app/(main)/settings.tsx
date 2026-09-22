import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Switch, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useBackHandler } from '../../hooks/useBackHandler';

export default function SettingsScreen() {
  const router = useRouter();
  const { session } = useAuthStore();
  const userId = session?.user?.id;
  const [pushEnabled, setPushEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const goBackToMore = useCallback(() => {
    router.replace('/(main)/more');
  }, []);
  useBackHandler(goBackToMore);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data, error } = await (supabase as any)
        .from('profiles')
        .select('push_enabled')
        .eq('id', userId)
        .single();
      if (!error && data) setPushEnabled(data.push_enabled ?? true);
      setLoading(false);
    })();
  }, [userId]);

  const handleToggle = async (value: boolean) => {
    setPushEnabled(value);
    setSaving(true);
    const { error } = await (supabase as any)
      .from('profiles')
      .update({ push_enabled: value })
      .eq('id', userId);
    setSaving(false);
    if (error) {
      setPushEnabled(!value);
      Alert.alert("Couldn't update setting", error.message);
    }
  };

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-16 px-4">
      <View className="flex-row items-center mb-6">
        <TouchableOpacity onPress={goBackToMore} className="flex-row items-center py-4 pr-8 -ml-2">
          <Ionicons name="chevron-back" size={28} color="#A61C14" />
          <Text className="text-[#A61C14] font-bold font-inter-bold text-xl">Back</Text>
        </TouchableOpacity>
        <Text className="text-2xl font-bold font-inter-bold text-[#1C1917] ml-2">Settings</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#A61C14" />
      ) : (
        <View className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 flex-row items-center justify-between">
          <View className="flex-1 mr-4">
            <Text className="text-base font-semibold font-inter-semibold text-[#1C1917]">Push Notifications</Text>
            <Text className="text-[#78716C] text-sm mt-1">Get notified when your order status changes.</Text>
          </View>
          <Switch
            value={pushEnabled}
            onValueChange={handleToggle}
            disabled={saving}
            trackColor={{ false: '#E7E5E4', true: '#A61C14' }}
            thumbColor="#FFFFFF"
          />
        </View>
      )}
    </View>
  );
}
