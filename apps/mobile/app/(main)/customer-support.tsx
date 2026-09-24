import { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useBackHandler } from '../../hooks/useBackHandler';
import { useCartBarSpace } from '../../hooks/useCartBarSpace';

const SUPPORT_PHONE = '(548) 866-0420';
const SUPPORT_PHONE_DIAL = '+15488660420';

// Optional one-tap topic, saved alongside the message (customer_feedback.
// topic) so staff can sort feedback -- a "Missing Item" can be acted on
// right away instead of being buried among general comments. Each topic
// also swaps in a placeholder that prompts for the details that matter.
const TOPICS = [
  { label: 'Food Quality', icon: 'restaurant-outline', placeholder: 'Which item was it, and what was wrong?' },
  { label: 'Missing Item', icon: 'bag-remove-outline', placeholder: 'What was missing, and roughly when did you order?' },
  { label: 'Order Speed', icon: 'time-outline', placeholder: 'How long did it take, and was it pickup or delivery?' },
  { label: 'Compliment', icon: 'heart-outline', placeholder: 'What did you love? We will pass it on to the team.' },
  { label: 'Other', icon: 'chatbubble-ellipses-outline', placeholder: 'Tell us what you think...' },
];

export default function CustomerSupportScreen() {
  const cartBarSpace = useCartBarSpace();
  const router = useRouter();
  const { session } = useAuthStore();
  const [message, setMessage] = useState('');
  const [topic, setTopic] = useState<string | null>(null);
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
        // Only sent when picked, so a plain comment still goes through the
        // same way it always has.
        ...(topic ? { topic } : {}),
      });
      if (error) throw error;
      setMessage('');
      setTopic(null);
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

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: cartBarSpace }}
      >
        <TouchableOpacity
          onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE_DIAL}`)}
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

        <Text className="text-base font-inter-bold text-[#1C1917] mb-1">Leave a Comment or Review</Text>
        <Text className="text-xs text-[#78716C] mb-3">What's it about? (optional)</Text>
        <View className="flex-row flex-wrap mb-3">
          {TOPICS.map((t) => {
            const selected = topic === t.label;
            return (
              <TouchableOpacity
                key={t.label}
                onPress={() => setTopic(selected ? null : t.label)}
                className={`flex-row items-center px-3 py-2 rounded-full border mr-2 mb-2 ${
                  selected ? 'bg-[#A61C14] border-[#A61C14]' : 'bg-white border-stone-300'
                }`}
              >
                <Ionicons name={t.icon as any} size={14} color={selected ? '#F4ECE1' : '#78716C'} />
                <Text className={`text-xs font-inter-semibold ml-1.5 ${selected ? 'text-[#F4ECE1]' : 'text-[#1C1917]'}`}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TextInput
          className="bg-white border border-stone-300 rounded-xl p-3.5 text-sm text-[#1C1917] mb-4"
          style={{ minHeight: 120 }}
          placeholder={TOPICS.find((t) => t.label === topic)?.placeholder ?? 'Tell us what you think...'}
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