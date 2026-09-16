import { useState, useEffect } from 'react';
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

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleRegister = async () => {
    if (!firstName.trim() || !lastName.trim() || !phone.trim() || !address.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Missing Info', 'Please fill out all fields.');
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
      Alert.alert('Registration Failed', error.message);
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
        
        <View className="flex-row justify-between mb-4">
          <TextInput
            className="bg-white border border-stone-300 p-4 rounded-xl flex-1 mr-2 text-base text-[#1C1917]"
            placeholder="First Name"
            placeholderTextColor="#A8A29E"
            value={firstName}
            onChangeText={setFirstName}
          />
          <TextInput
            className="bg-white border border-stone-300 p-4 rounded-xl flex-1 ml-2 text-base text-[#1C1917]"
            placeholder="Last Name"
            placeholderTextColor="#A8A29E"
            value={lastName}
            onChangeText={setLastName}
          />
        </View>

        <TextInput
          className="bg-white border border-stone-300 p-4 rounded-xl mb-4 text-base text-[#1C1917]"
          placeholder="Phone Number"
          placeholderTextColor="#A8A29E"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />

        <TextInput
          className="bg-white border border-stone-300 p-4 rounded-xl mb-4 text-base text-[#1C1917]"
          placeholder="Email"
          placeholderTextColor="#A8A29E"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <TextInput
          className="bg-white border border-stone-300 p-4 rounded-xl mb-4 text-base text-[#1C1917]"
          placeholder="Password (min 6 chars)"
          placeholderTextColor="#A8A29E"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <View className="z-50 mb-6 w-full">
          <AddressAutocomplete 
            defaultAddress={address}
            onAddressSelect={setAddress}
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