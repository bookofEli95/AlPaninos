import { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useBackHandler } from '../../hooks/useBackHandler';

const SUPPORT_PHONE = '(519) 555-0123';

export default function CustomerSupportScreen() {
  const router = useRouter();
  const { session } = useAuthStore();
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const goBackToMore = useCallback(() => {
    router.replace('/(main)/more');
  }, [router]);
  useBackHandler(goBackToMore);

  const handleSubmit = async () => {
    if (!message.trim()) {
      Alert.alert('Empty Message', 'Please write a comment or review first.');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await (supabase as any).from('customer_feedback').insert({
        user_id: session?.user?.id,
        message: message.trim(),
      });
      if (error) throw error;
      setMessage('');
      Alert.alert('Thank You!', 'Your feedback has been sent.');
    } catch (e: any) {
      Alert.alert("Couldn't send feedback", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-16 px-4">
      <View className="flex-row items-center mb-6">
        <TouchableOpacity onPress={goBackToMore} className="flex-row items-center py-2 pr-4 -ml-2">
          <Ionicons name="chevron-back" size={26} color="#A61C14" />
          <Text className="text-[#A61C14] font-inter-bold text-base">Back</Text>
        </TouchableOpacity>
        <Text className="text-2xl font-display-bold text-[#1C1917] tracking-tight ml-2">Customer Support</Text>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
        <TouchableOpacity
          onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE.replace(/[^0-9+]/g, '')}`)}
          className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 flex-row items-center mb-5"
        >
          <View className="w-11 h-11 rounded-full bg-[#FAF6F0] items-center justify-center mr-3 border border-stone-200">
            <Ionicons name="call" size={20} color="#A61C14" />
          </View>
          <View>
            <Text className="text-xs text-[#78716C] uppercase font-inter-bold tracking-wider">Call Us</Text>
            <Text className="text-base font-inter-bold text-[#1C1917]">{SUPPORT_PHONE}</Text>
          </View>
        </TouchableOpacity>

        <Text className="text-base font-inter-bold text-[#1C1917] mb-2">Leave a Comment or Review</Text>
        <TextInput
          className="bg-white border border-stone-300 rounded-xl p-3.5 text-sm text-[#1C1917] mb-4"
          style={{ minHeight: 120 }}
          placeholder="Tell us what you think..."
          placeholderTextColor="#A8A29E"
          value={message}
          onChangeText={setMessage}
          multiline
          textAlignVertical="top"
        />
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting}
          className="bg-[#A61C14] p-3.5 rounded-xl items-center shadow-sm active:bg-[#85140E] mb-12"
        >
          {submitting ? (
            <ActivityIndicator color="#F4ECE1" />
          ) : (
            <Text className="text-[#F4ECE1] font-inter-bold text-base">Submit</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}