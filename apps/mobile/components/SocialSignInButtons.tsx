import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { appleSignInAvailable, signInWithApple, signInWithGoogle } from '../lib/socialSignIn';

// "Continue with Apple" (iPhone only) and "Continue with Google" -- one tap
// to sign in, or to make an account the first time. Once signed in, the
// root layout takes the customer into the app.
export default function SocialSignInButtons({
  disabled = false,
  onBusyChange,
  onError,
}: {
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onError: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);

  useEffect(() => {
    appleSignInAvailable().then(setAppleAvailable);
  }, []);

  const run = async (which: 'apple' | 'google') => {
    if (busy || disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setBusy(which);
    onBusyChange?.(true);
    try {
      const result = which === 'apple' ? await signInWithApple() : await signInWithGoogle();
      if (result === 'signed-in') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        // The name from Apple/Google may have just been filled in.
        queryClient.invalidateQueries({ queryKey: ['profile'] });
      }
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      const name = which === 'apple' ? 'Apple' : 'Google';
      const message = String(e?.message ?? '');
      onError(
        /provider is not enabled|unsupported provider/i.test(message)
          ? `Signing in with ${name} isn't switched on yet.`
          : message
          ? `Couldn't sign in with ${name}: ${message}`
          : `Couldn't sign in with ${name}. Please try again.`
      );
    } finally {
      setBusy(null);
      onBusyChange?.(false);
    }
  };

  const off = disabled || !!busy;

  return (
    <View style={{ gap: 10 }}>
      {appleAvailable && (
        <View pointerEvents={off ? 'none' : 'auto'} style={{ opacity: off && busy !== 'apple' ? 0.6 : 1 }}>
          {busy === 'apple' ? (
            <View className="bg-white rounded-2xl items-center justify-center" style={{ height: 50 }}>
              <ActivityIndicator color="#1C1917" size="small" />
            </View>
          ) : (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={16}
              style={{ height: 50, width: '100%' }}
              onPress={() => run('apple')}
            />
          )}
        </View>
      )}

      <TouchableOpacity
        onPress={() => run('google')}
        disabled={off}
        activeOpacity={0.85}
        accessibilityLabel="Continue with Google"
        className="bg-white rounded-2xl flex-row items-center justify-center"
        style={{ height: 50, opacity: off && busy !== 'google' ? 0.6 : 1 }}
      >
        {busy === 'google' ? (
          <ActivityIndicator color="#1C1917" size="small" />
        ) : (
          <>
            <Ionicons name="logo-google" size={18} color="#1C1917" />
            <Text className="text-[#1C1917] font-inter-semibold text-[17px] ml-2">Continue with Google</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}
