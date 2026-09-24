import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Keyboard,
  Alert,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import ErrorBanner from '../../components/ErrorBanner';
import { isValidEmail } from '../../lib/passwordStrength';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [forgotPasswordVisible, setForgotPasswordVisible] = useState(false);
  const [resetStep, setResetStep] = useState<'email' | 'code'>('email');
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [sendingReset, setSendingReset] = useState(false);
  const [submittingReset, setSubmittingReset] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const heroProgress = useSharedValue(0);
  const formProgress = useSharedValue(0);

  const videoPlayer = useVideoPlayer(
    require('../../assets/videos/login-background.mp4'),
    (player) => {
      player.loop = true;
      player.muted = true;
      player.play();
    }
  );

  useEffect(() => {
    heroProgress.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) });
    formProgress.value = withDelay(
      200,
      withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) })
    );
  }, [heroProgress, formProgress]);

  const heroStyle = useAnimatedStyle(() => ({
    opacity: heroProgress.value,
    transform: [{ translateY: (1 - heroProgress.value) * -20 }],
  }));

  const formStyle = useAnimatedStyle(() => ({
    opacity: formProgress.value,
    transform: [{ translateY: (1 - formProgress.value) * 20 }],
  }));

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) =>
      setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleLogin = async () => {
    setErrorMessage(null);
    if (!email.trim() || !password) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setErrorMessage('Please enter your email and password.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      // Sent exactly as typed -- register.tsx saves the password untrimmed,
      // so trimming it here would lock out anyone whose password starts or
      // ends with a space.
      password,
    });
    if (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setErrorMessage(error.message);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    setLoading(false);
  };

  const handleOpenForgotPassword = () => {
    setResetEmail(email.trim());
    setResetStep('email');
    setResetCode('');
    setNewPassword('');
    setResetError(null);
    setForgotPasswordVisible(true);
  };

  const handleSendResetCode = async () => {
    setResetError(null);
    if (!isValidEmail(resetEmail)) {
      setResetError('Please enter a valid email address.');
      return;
    }
    setSendingReset(true);
    try {
      // Same "typed-in code" convention as guest email verification (see
      // cart.tsx) -- the recovery email template shows {{ .Token }} instead
      // of a tapped link, since a link would need app-scheme deep-link
      // handling this project doesn't have set up.
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim());
      if (error) throw error;
      setResetStep('code');
    } catch (e: any) {
      setResetError(e.message);
    } finally {
      setSendingReset(false);
    }
  };

  const handleConfirmReset = async () => {
    setResetError(null);
    if (resetCode.trim().length !== 6) {
      setResetError('Enter the 6-digit code from your email.');
      return;
    }
    if (newPassword.length < 6) {
      setResetError('Password must be at least 6 characters long.');
      return;
    }
    setSubmittingReset(true);
    try {
      // Verifying a recovery OTP immediately establishes a signed-in session
      // for this user (same as any other login) -- the new password is set
      // right after, in the same call chain, before the app's own
      // auth-state listener (app/_layout.tsx) has a chance to navigate away
      // from this screen and strand the user mid-flow with their password
      // never actually changed.
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: resetEmail.trim(),
        token: resetCode.trim(),
        type: 'recovery',
      });
      if (verifyError) throw verifyError;

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      setForgotPasswordVisible(false);
      Alert.alert(
        'Password Updated',
        "You're all set -- you've been signed in with your new password."
      );
    } catch (e: any) {
      setResetError(e.message);
    } finally {
      setSubmittingReset(false);
    }
  };

  const handleGuestCheckout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setErrorMessage(null);
    setGuestLoading(true);
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setErrorMessage(error.message);
    }
    setGuestLoading(false);
  };

  const isBusy = loading || guestLoading;

  return (
    <View className="flex-1 bg-[#1C1917]">
      <VideoView
        player={videoPlayer}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="cover"
        nativeControls={false}
        pointerEvents="none"
      />
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.50)',
        }}
        pointerEvents="none"
      />

      <View className="flex-1 justify-center px-6" style={{ marginBottom: keyboardHeight }}>
        <Animated.View style={heroStyle} className="items-center mb-4">
          <Image
            source={require('../../assets/logo.jpg')}
            className="w-32 h-32 rounded-full mb-3 shadow-md"
            resizeMode="contain"
          />
          <Text className="text-3xl font-display-bold text-[#F4ECE1] tracking-tight">
            Al Paninos
          </Text>
        </Animated.View>

        <Animated.View
          style={heroStyle}
          className="flex-row items-center self-center bg-[#A61C14] px-3.5 py-1.5 rounded-full mb-5 shadow-sm"
        >
          <Ionicons name="sparkles" size={14} color="#F4ECE1" />
          <Text className="text-[#F4ECE1] font-inter-bold text-xs ml-1.5">
            Earn rewards with every order
          </Text>
        </Animated.View>

        <Animated.View style={formStyle}>
          {errorMessage && <ErrorBanner message={errorMessage} />}

          <View className="flex-row items-center bg-white border border-stone-300 rounded-2xl mb-3 px-3.5 shadow-sm">
            <Ionicons name="mail-outline" size={18} color="#A8A29E" />
            <TextInput
              className="flex-1 p-3.5 text-sm text-[#1C1917]"
              placeholder="Email address"
              placeholderTextColor="#A8A29E"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setErrorMessage(null);
              }}
              editable={!isBusy}
            />
          </View>

          <View className="flex-row items-center bg-white border border-stone-300 rounded-2xl mb-2 px-3.5 shadow-sm">
            <Ionicons name="lock-closed-outline" size={18} color="#A8A29E" />
            <TextInput
              className="flex-1 p-3.5 text-sm text-[#1C1917]"
              placeholder="Password"
              placeholderTextColor="#A8A29E"
              secureTextEntry
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setErrorMessage(null);
              }}
              editable={!isBusy}
            />
          </View>

          {/* Always available, not only after a failed sign-in -- someone who
              already knows they've forgotten shouldn't have to fail first. */}
          <TouchableOpacity
            onPress={handleOpenForgotPassword}
            disabled={isBusy}
            className="self-end mb-4 py-1"
            hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}
          >
            <Text className="text-[#F4ECE1] text-xs font-inter-semibold underline">
              Forgot password?
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="bg-[#A61C14] p-3.5 rounded-2xl mb-3 items-center shadow-md active:bg-[#85140E]"
            onPress={handleLogin}
            disabled={isBusy}
          >
            {loading ? (
              <ActivityIndicator color="#F4ECE1" size="small" />
            ) : (
              <Text className="text-[#F4ECE1] text-center font-inter-bold text-base">Sign In</Text>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View className="flex-row items-center my-2.5">
            <View className="flex-1 h-[1px] bg-white/20" />
            <Text className="text-[#F4ECE1]/60 font-inter-medium text-xs px-3">or</Text>
            <View className="flex-1 h-[1px] bg-white/20" />
          </View>

          <TouchableOpacity
            className="bg-white/10 border border-white/20 p-3.5 rounded-2xl mb-4 items-center flex-row justify-center active:bg-white/20"
            onPress={handleGuestCheckout}
            disabled={isBusy}
          >
            {guestLoading ? (
              <ActivityIndicator color="#F4ECE1" size="small" />
            ) : (
              <>
                <Ionicons name="flash-outline" size={16} color="#F4ECE1" style={{ marginRight: 6 }} />
                <Text className="text-[#F4ECE1] text-center font-inter-bold text-sm">
                  Continue as Guest
                </Text>
              </>
            )}
          </TouchableOpacity>

          <Link href="/(auth)/register" asChild>
            <TouchableOpacity disabled={isBusy} className="py-2">
              <Text className="text-[#F4ECE1] text-center text-xs font-inter-medium">
                Don't have an account?{' '}
                <Text className="underline font-inter-bold text-[#F4ECE1]">Sign Up</Text>
              </Text>
            </TouchableOpacity>
          </Link>
        </Animated.View>
      </View>

      {/* Forgot Password Sheet */}
      {forgotPasswordVisible && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
          }}
        >
          <TouchableOpacity
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            activeOpacity={1}
            onPress={() => setForgotPasswordVisible(false)}
          />
          <View className="bg-[#FAF6F0] rounded-3xl mx-4 p-5" style={{ marginTop: 100 }}>
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-lg font-display-bold text-[#1C1917] tracking-tight">
                Reset Password
              </Text>
              <TouchableOpacity
                onPress={() => setForgotPasswordVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color="#1C1917" />
              </TouchableOpacity>
            </View>

            {resetError && <ErrorBanner message={resetError} />}

            {resetStep === 'email' ? (
              <>
                <Text className="text-stone-500 text-xs mb-3">
                  Enter your email and we'll send you a 6-digit code to reset your password.
                </Text>
                <TextInput
                  className="bg-white border border-stone-300 rounded-xl p-3 mb-3 text-sm text-[#1C1917]"
                  placeholder="Email"
                  placeholderTextColor="#A8A29E"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={resetEmail}
                  onChangeText={setResetEmail}
                />
                <TouchableOpacity
                  className="bg-[#A61C14] p-3.5 rounded-xl items-center active:bg-[#85140E]"
                  onPress={handleSendResetCode}
                  disabled={sendingReset}
                >
                  {sendingReset ? (
                    <ActivityIndicator color="#F4ECE1" size="small" />
                  ) : (
                    <Text className="text-[#F4ECE1] font-inter-bold text-sm">Send Reset Code</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text className="text-stone-500 text-xs mb-3">
                  Enter the 6-digit code sent to {resetEmail.trim()} and pick a new password.
                </Text>
                <TextInput
                  className="bg-white border border-stone-300 rounded-xl p-3 mb-2.5 text-sm text-[#1C1917]"
                  placeholder="6-digit code"
                  placeholderTextColor="#A8A29E"
                  keyboardType="number-pad"
                  maxLength={6}
                  value={resetCode}
                  onChangeText={setResetCode}
                />
                <TextInput
                  className="bg-white border border-stone-300 rounded-xl p-3 mb-3 text-sm text-[#1C1917]"
                  placeholder="New password (min 6 characters)"
                  placeholderTextColor="#A8A29E"
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
                <TouchableOpacity
                  className="bg-[#A61C14] p-3.5 rounded-xl items-center mb-2.5 active:bg-[#85140E]"
                  onPress={handleConfirmReset}
                  disabled={submittingReset}
                >
                  {submittingReset ? (
                    <ActivityIndicator color="#F4ECE1" size="small" />
                  ) : (
                    <Text className="text-[#F4ECE1] font-inter-bold text-sm">Update Password</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSendResetCode}
                  disabled={sendingReset}
                  className="py-1.5 items-center"
                >
                  <Text className="text-stone-500 text-xs font-inter-semibold">Resend Code</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}
