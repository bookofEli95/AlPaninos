import { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useBackHandler } from '../../hooks/useBackHandler';

// TODO: replace with the restaurant's real support number.
const SUPPORT_PHONE = '(519) 555-0123';

export default function CustomerSupportScreen() {
  const router = useRouter();
  const { session } = useAuthStore();
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const goBackToMore = useCallback(() => {
    router.replace('/(main)/more');
  }, []);
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
        <TouchableOpacity onPress={goBackToMore} className="flex-row items-center py-4 pr-8 -ml-2">
          <Ionicons name="chevron-back" size={28} color="#A61C14" />
          <Text className="text-[#A61C14] font-bold font-inter-bold text-xl">Back</Text>
        </TouchableOpacity>
        <Text className="text-2xl font-bold font-inter-bold text-[#1C1917] ml-2">Customer Support</Text>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
        <TouchableOpacity
          onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE.replace(/[^0-9+]/g, '')}`)}
          className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 flex-row items-center mb-6"
        >
          <View className="w-12 h-12 rounded-full bg-[#FAF6F0] items-center justify-center mr-4">
            <Ionicons name="call" size={22} color="#A61C14" />
          </View>
          <View>
            <Text className="text-xs text-[#78716C] uppercase font-bold font-inter-bold tracking-wider">Call Us</Text>
            <Text className="text-lg font-bold font-inter-bold text-[#1C1917]">{SUPPORT_PHONE}</Text>
          </View>
        </TouchableOpacity>

        <Text className="text-lg font-bold font-inter-bold text-[#1C1917] mb-2">Leave a Comment or Review</Text>
        <TextInput
          className="bg-white border border-stone-300 rounded-xl p-4 text-base text-[#1C1917] mb-4"
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
          className="bg-[#A61C14] p-4 rounded-xl items-center shadow-md active:bg-[#85140E] mb-12"
        >
          {submitting ? (
            <ActivityIndicator color="#F4ECE1" />
          ) : (
            <Text className="text-[#F4ECE1] font-bold font-inter-bold text-lg">Submit</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
