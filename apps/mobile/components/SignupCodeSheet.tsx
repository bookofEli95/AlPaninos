import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import ErrorBanner from './ErrorBanner';

type Props = {
  visible: boolean;
  email: string;
  onClose: () => void;
  // Shown above the code box, e.g. why a code was just sent.
  intro?: string;
};

// How long before "Resend code" works again -- matches the "minimum interval
// per user" set in Supabase's SMTP settings, which would reject it sooner.
const RESEND_COOLDOWN_SECONDS = 60;

// Confirms a new account with the 6-digit code from the sign-up email
// (the "Confirm signup" template shows {{ .Token }} instead of a link). A
// correct code signs the customer straight in, and app/_layout.tsx takes
// it from there (welcome spin or menu). Used by Sign Up, and by Sign In
// when someone never finished confirming. Render it last inside a
// full-screen View -- it's an absolute overlay.
export default function SignupCodeSheet({ visible, email, onClose, intro }: Props) {
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  // A fresh start each time it opens (a code was just sent, so the resend
  // timer starts running).
  useEffect(() => {
    if (!visible) return;
    setCode('');
    setError(null);
    setNotice(null);
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }, [visible, email]);

  useEffect(() => {
    if (!visible || cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [visible, cooldown]);

  const handleVerify = async () => {
    setError(null);
    setNotice(null);
    if (code.trim().length !== 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setVerifying(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'signup',
    });
    setVerifying(false);
    if (verifyError) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(
        /expired|invalid/i.test(verifyError.message)
          ? 'That code is wrong or has expired. Check the latest email, or send a new code.'
          : verifyError.message
      );
      return;
    }
    // Signed in -- the root layout navigates away from the sign-in screens.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onClose();
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    setError(null);
    setNotice(null);
    setResending(true);
    const { error: resendError } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
    setResending(false);
    if (resendError) {
      setError(resendError.message);
      return;
    }
    setCode('');
    setNotice(`New code sent to ${email.trim()}.`);
    setCooldown(RESEND_COOLDOWN_SECONDS);
  };

  if (!visible) return null;

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <View className="bg-[#FAF6F0] rounded-3xl mx-4 p-5" style={{ marginTop: 100 }}>
        <View className="flex-row justify-between items-center mb-3">
          <Text className="text-lg font-display-bold text-[#1C1917] tracking-tight">Confirm Your Email</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color="#1C1917" />
          </TouchableOpacity>
        </View>

        {error && <ErrorBanner message={error} />}
        {notice && (
          <View className="flex-row items-center bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mb-3">
            <Ionicons name="checkmark-circle" size={16} color="#047857" />
            <Text className="text-emerald-800 text-xs font-inter-semibold ml-1.5 flex-1">{notice}</Text>
          </View>
        )}

        <Text className="text-stone-500 text-xs mb-3">
          {intro ? `${intro} ` : ''}Enter the 6-digit code we emailed to {email.trim()}. Check your spam folder if you don't see it.
        </Text>

        <TextInput
          className="bg-white border border-stone-300 rounded-xl p-3 mb-3 text-lg text-[#1C1917] text-center tracking-widest font-inter-bold"
          placeholder="000000"
          placeholderTextColor="#A8A29E"
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          value={code}
          onChangeText={(text) => setCode(text.replace(/[^0-9]/g, ''))}
          onSubmitEditing={handleVerify}
        />

        <TouchableOpacity
          className={`p-3.5 rounded-xl items-center mb-2.5 ${
            code.length === 6 && !verifying ? 'bg-[#A61C14] active:bg-[#85140E]' : 'bg-stone-300'
          }`}
          onPress={handleVerify}
          disabled={code.length !== 6 || verifying}
        >
          {verifying ? (
            <ActivityIndicator color="#F4ECE1" size="small" />
          ) : (
            <Text className={`font-inter-bold text-sm ${code.length === 6 ? 'text-[#F4ECE1]' : 'text-stone-500'}`}>
              Confirm & Sign In
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleResend} disabled={cooldown > 0 || resending} className="items-center py-1.5">
          {resending ? (
            <ActivityIndicator color="#A61C14" size="small" />
          ) : (
            <Text className={`text-xs font-inter-semibold ${cooldown > 0 ? 'text-stone-400' : 'text-[#A61C14]'}`}>
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
