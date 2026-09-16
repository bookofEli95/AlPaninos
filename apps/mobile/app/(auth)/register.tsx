import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  ActivityIndicator,
  Keyboard
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import AddressAutocomplete from '../../components/AddressAutocomplete';
import ErrorBanner from '../../components/ErrorBanner';
import { getPasswordStrength, isValidEmail } from '../../lib/passwordStrength';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const isAddressFocusedRef = useRef(false);

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
      if (isAddressFocusedRef.current) {
        scrollRef.current?.scrollToEnd({ animated: true });
      }
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleRegister = async () => {
    setErrorMessage(null);

    if (!firstName.trim() || !lastName.trim() || !phone.trim() || !address.trim() || !email.trim() || !password.trim()) {
      setErrorMessage('Please fill out all fields.');
      return;
    }
    if (!isValidEmail(email)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password: password,
      options: {
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim(),
          address: address.trim(),
        },
      },
    });

    setLoading(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    Alert.alert(
      'Verification Email Sent',
      'Please check your inbox and verify your email address before signing in.',
      [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]
    );
  };

  return (
    <View className="flex-1 bg-[#FAF6F0]">
      <ScrollView
        ref={scrollRef}
        className="flex-1 px-6 pt-12"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: keyboardHeight }}
      >
        <View className="items-center mb-6">
          <Image
            source={require('../../assets/logo.jpg')}
            className="w-24 h-24 rounded-full mb-3 shadow-md"
            resizeMode="contain"
          />
          <Text className="text-3xl font-extrabold text-[#1C1917]">Create Account</Text>
        </View>

        {errorMessage && <ErrorBanner message={errorMessage} />}

        <View className="flex-row justify-between mb-4">
          <TextInput
            className="bg-white border border-stone-300 p-4 rounded-xl flex-1 mr-2 text-base text-[#1C1917]"
            placeholder="First Name"
            placeholderTextColor="#A8A29E"
            value={firstName}
            onChangeText={setFirstName}
            onFocus={() => { isAddressFocusedRef.current = false; }}
          />
          <TextInput
            className="bg-white border border-stone-300 p-4 rounded-xl flex-1 ml-2 text-base text-[#1C1917]"
            placeholder="Last Name"
            placeholderTextColor="#A8A29E"
            value={lastName}
            onChangeText={setLastName}
            onFocus={() => { isAddressFocusedRef.current = false; }}
          />
        </View>

        <TextInput
          className="bg-white border border-stone-300 p-4 rounded-xl mb-4 text-base text-[#1C1917]"
          placeholder="Phone Number"
          placeholderTextColor="#A8A29E"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
          onFocus={() => { isAddressFocusedRef.current = false; }}
        />

        <TextInput
          className="bg-white border border-stone-300 p-4 rounded-xl mb-4 text-base text-[#1C1917]"
          placeholder="Email"
          placeholderTextColor="#A8A29E"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          onFocus={() => { isAddressFocusedRef.current = false; }}
        />

        <TextInput
          className="bg-white border border-stone-300 p-4 rounded-xl text-base text-[#1C1917]"
          placeholder="Password (min 6 chars)"
          placeholderTextColor="#A8A29E"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onFocus={() => { isAddressFocusedRef.current = false; }}
        />

        {password.length > 0 && (
          <View className="mb-4 mt-2">
            <View className="h-1.5 bg-stone-200 rounded-full overflow-hidden">
              <View
                style={{ width: `${strength.percent}%`, backgroundColor: strength.color }}
                className="h-full rounded-full"
              />
            </View>
            <Text style={{ color: strength.color }} className="text-xs font-bold mt-1">
              {strength.label} password
            </Text>
          </View>
        )}
        {password.length === 0 && <View className="mb-4" />}

        <View className="z-50 mb-6 w-full">
          <AddressAutocomplete
            defaultAddress={address}
            onAddressSelect={setAddress}
            onFocus={() => {
              isAddressFocusedRef.current = true;
              // If the keyboard is already up (re-focusing the field), the
              // keyboardDidShow handler above won't fire again -- scroll now too.
              scrollRef.current?.scrollToEnd({ animated: true });
            }}
          />
        </View>

        <TouchableOpacity
          className="bg-[#A61C14] p-4 rounded-xl mb-4 items-center shadow-md active:bg-[#85140E]"
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#F4ECE1" />
          ) : (
            <Text className="text-[#F4ECE1] text-center font-bold text-lg">Sign Up</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} className="mb-12 py-2">
          <Text className="text-[#78716C] text-center text-base font-semibold">Back to Login</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
