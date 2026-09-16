import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  Image,
  ActivityIndicator,
  Keyboard
} from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '../../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing Info', 'Please enter your email and password.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ 
      email: email.trim(), 
      password: password.trim() 
    });
    if (error) Alert.alert('Login Failed', error.message);
    setLoading(false);
  };

  const handleGuestCheckout = async () => {
    setGuestLoading(true);
    const { error } = await supabase.auth.signInAnonymously();
    if (error) Alert.alert('Guest Login Failed', error.message);
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
        
        <TextInput
          className="bg-white border border-stone-300 p-4 rounded-xl mb-4 text-base text-[#1C1917]"
          placeholder="Email"
          placeholderTextColor="#A8A29E"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          editable={!isBusy}
        />
        
        <TextInput
          className="bg-white border border-stone-300 p-4 rounded-xl mb-6 text-base text-[#1C1917]"
          placeholder="Password"
          placeholderTextColor="#A8A29E"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
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