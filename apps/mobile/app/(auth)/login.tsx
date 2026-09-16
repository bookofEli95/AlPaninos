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
import { Link } from 'expo-router';
import { supabase } from '../../lib/supabase';
import ErrorBanner from '../../components/ErrorBanner';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
    <View className="flex-1 bg-[#FAF6F0]">
      <View className="flex-1 justify-center px-6" style={{ marginBottom: keyboardHeight }}>
        <View className="items-center mb-8">
          <Image
            source={require('../../assets/logo.jpg')}
            className="w-24 h-24 rounded-full mb-3 shadow-md"
            resizeMode="contain"
          />
          <Text className="text-3xl font-extrabold text-[#1C1917]">AlPaninos</Text>
        </View>

        {errorMessage && <ErrorBanner message={errorMessage} />}

        <TextInput
          className="bg-white border border-stone-300 p-4 rounded-xl mb-4 text-base text-[#1C1917]"
          placeholder="Email"
          placeholderTextColor="#A8A29E"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={(text) => { setEmail(text); setErrorMessage(null); }}
          editable={!isBusy}
        />

        <TextInput
          className="bg-white border border-stone-300 p-4 rounded-xl mb-6 text-base text-[#1C1917]"
          placeholder="Password"
          placeholderTextColor="#A8A29E"
          secureTextEntry
          value={password}
          onChangeText={(text) => { setPassword(text); setErrorMessage(null); }}
          editable={!isBusy}
        />

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
      </View>
    </View>
  );
}
