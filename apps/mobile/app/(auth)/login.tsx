import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Keyboard
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from 'react-native-reanimated';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import ErrorBanner from '../../components/ErrorBanner';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const heroProgress = useSharedValue(0);
  const formProgress = useSharedValue(0);

  const videoPlayer = useVideoPlayer(require('../../assets/videos/login-background.mp4'), (player) => {
    player.loop = true;
    player.muted = true;
    player.play();
  });

  useEffect(() => {
    heroProgress.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) });
    formProgress.value = withDelay(200, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
  }, []);

  const heroStyle = useAnimatedStyle(() => ({
    opacity: heroProgress.value,
    transform: [{ translateY: (1 - heroProgress.value) * -20 }],
  }));

  const formStyle = useAnimatedStyle(() => ({
    opacity: formProgress.value,
    transform: [{ translateY: (1 - formProgress.value) * 20 }],
  }));

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleLogin = async () => {
    setErrorMessage(null);
    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please enter your email and password.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim()
    });
    if (error) setErrorMessage(error.message);
    setLoading(false);
  };

  const handleGuestCheckout = async () => {
    setErrorMessage(null);
    setGuestLoading(true);
    const { error } = await supabase.auth.signInAnonymously();
    if (error) setErrorMessage(error.message);
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
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' }}
        pointerEvents="none"
      />

      <View className="flex-1 justify-center px-6" style={{ marginBottom: keyboardHeight }}>
        <Animated.View style={heroStyle} className="items-center mb-5">
          <Image
            source={require('../../assets/logo.jpg')}
            className="w-24 h-24 rounded-full mb-3 shadow-md"
            resizeMode="contain"
          />
          <Text className="text-3xl font-extrabold text-[#F4ECE1]">AlPaninos</Text>
        </Animated.View>

        <Animated.View
          style={heroStyle}
          className="flex-row items-center self-center bg-[#A61C14] px-4 py-2 rounded-full mb-6"
        >
          <Ionicons name="gift-outline" size={16} color="#F4ECE1" />
          <Text className="text-[#F4ECE1] font-bold text-sm ml-2">Earn rewards with every order</Text>
        </Animated.View>

      <Animated.View style={formStyle}>
        {errorMessage && <ErrorBanner message={errorMessage} />}

        <View className="flex-row items-center bg-white border border-stone-300 rounded-xl mb-4 px-4">
          <Ionicons name="mail-outline" size={20} color="#A8A29E" />
          <TextInput
            className="flex-1 p-4 text-base text-[#1C1917]"
            placeholder="Email"
            placeholderTextColor="#A8A29E"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={(text) => { setEmail(text); setErrorMessage(null); }}
            editable={!isBusy}
          />
        </View>

        <View className="flex-row items-center bg-white border border-stone-300 rounded-xl mb-6 px-4">
          <Ionicons name="lock-closed-outline" size={20} color="#A8A29E" />
          <TextInput
            className="flex-1 p-4 text-base text-[#1C1917]"
            placeholder="Password"
            placeholderTextColor="#A8A29E"
            secureTextEntry
            value={password}
            onChangeText={(text) => { setPassword(text); setErrorMessage(null); }}
            editable={!isBusy}
          />
        </View>

        <TouchableOpacity
          className="bg-[#A61C14] p-4 rounded-xl mb-4 items-center shadow-md active:bg-[#85140E]"
          onPress={handleLogin}
          disabled={isBusy}
        >
          {loading ? (
            <ActivityIndicator color="#F4ECE1" />
          ) : (
            <Text className="text-[#F4ECE1] text-center font-bold text-lg">Sign In</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-[#1C1917] p-4 rounded-xl mb-6 items-center active:opacity-90"
          onPress={handleGuestCheckout}
          disabled={isBusy}
        >
          {guestLoading ? (
            <ActivityIndicator color="#F4ECE1" />
          ) : (
            <Text className="text-[#F4ECE1] text-center font-bold text-lg">Continue as Guest</Text>
          )}
        </TouchableOpacity>

        <Link href="/(auth)/register" asChild>
          <TouchableOpacity disabled={isBusy} className="py-2">
            <Text className="text-[#A61C14] text-center text-base font-semibold">
              Don't have an account? <Text className="underline font-bold">Sign Up</Text>
            </Text>
          </TouchableOpacity>
        </Link>
        </Animated.View>
      </View>
    </View>
  );
}
