import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  ActivityIndicator,
  Keyboard,
  Dimensions
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import AddressAutocomplete from '../../components/AddressAutocomplete';
import CountryPickerSheet from '../../components/CountryPickerSheet';
import NotifyPreferenceToggle from '../../components/NotifyPreferenceToggle';
import ErrorBanner from '../../components/ErrorBanner';
import { getPasswordStrength, isValidEmail } from '../../lib/passwordStrength';
import { Country, DEFAULT_COUNTRY, formatPhoneNumber, isValidPhoneForCountry } from '../../lib/countries';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [addressPopupVisible, setAddressPopupVisible] = useState(false);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifySms, setNotifySms] = useState(false);
  const router = useRouter();

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
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
    if (!isValidPhoneForCountry(phone, country)) {
      setErrorMessage(`Please enter a valid phone number for ${country.name}.`);
      return;
    }
    if (!notifyEmail && !notifySms) {
      setErrorMessage('Choose at least one way to receive order updates.');
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
          phone: `+${country.dialCode}${phone.trim()}`,
          address: address.trim(),
          notify_email: notifyEmail,
          notify_sms: notifySms,
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
        className="flex-1 px-6 pt-12"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center mb-6">
          <Image
            source={require('../../assets/logo.jpg')}
            className="w-24 h-24 rounded-full mb-3 shadow-md"
            resizeMode="contain"
          />
          <Text className="text-3xl font-display-bold text-[#1C1917]">Create Account</Text>
        </View>

        {errorMessage && <ErrorBanner message={errorMessage} />}

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

        <View className="flex-row mb-4">
          <TouchableOpacity
            onPress={() => setCountryPickerVisible(true)}
            className="flex-row items-center bg-white border border-stone-300 rounded-xl px-3 mr-2"
          >
            <Text className="text-base mr-1">{country.flag}</Text>
            <Text className="text-base font-inter-semibold text-[#1C1917] mr-1">+{country.dialCode}</Text>
            <Ionicons name="chevron-down" size={14} color="#A8A29E" />
          </TouchableOpacity>
          <TextInput
            className="bg-white border border-stone-300 p-4 rounded-xl flex-1 text-base text-[#1C1917]"
            placeholder="Phone Number"
            placeholderTextColor="#A8A29E"
            keyboardType="phone-pad"
            value={formatPhoneNumber(phone, country)}
            onChangeText={(text) => setPhone(text.replace(/[^0-9]/g, ''))}
          />
        </View>

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
          className="bg-white border border-stone-300 p-4 rounded-xl text-base text-[#1C1917]"
          placeholder="Password (min 6 chars)"
          placeholderTextColor="#A8A29E"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {password.length > 0 && (
          <View className="mb-4 mt-2">
            <View className="h-1.5 bg-stone-200 rounded-full overflow-hidden">
              <View
                style={{ width: `${strength.percent}%`, backgroundColor: strength.color }}
                className="h-full rounded-full"
              />
            </View>
            <Text style={{ color: strength.color }} className="text-xs font-inter-bold mt-1">
              {strength.label} password
            </Text>
          </View>
        )}
        {password.length === 0 && <View className="mb-4" />}

        <TouchableOpacity
          onPress={() => setAddressPopupVisible(true)}
          className="flex-row items-center bg-white border border-stone-300 p-4 rounded-xl mb-6"
        >
          <Ionicons name="location-outline" size={20} color="#A8A29E" />
          <Text
            className={`flex-1 ml-3 text-base ${address ? 'text-[#1C1917]' : 'text-[#A8A29E]'}`}
            numberOfLines={1}
          >
            {address || 'Enter delivery address...'}
          </Text>
        </TouchableOpacity>

        <NotifyPreferenceToggle
          notifyEmail={notifyEmail}
          notifySms={notifySms}
          onChangeEmail={setNotifyEmail}
          onChangeSms={setNotifySms}
        />

        <TouchableOpacity
          className="bg-[#A61C14] p-4 rounded-xl mb-4 items-center shadow-md active:bg-[#85140E]"
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#F4ECE1" />
          ) : (
            <Text className="text-[#F4ECE1] text-center font-inter-bold text-lg">Sign Up</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} className="mb-12 py-2">
          <Text className="text-[#78716C] text-center text-base font-inter-semibold">Back to Login</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Address popup -- a plain in-tree overlay rather than RN's Modal,
          which crashes in this app when combined with certain style
          toggles (see the menu screen's order-type sheet for the same
          fix). Top-anchored so there's maximum room above the keyboard
          for the full suggestion list to be visible without scrolling. */}
      {addressPopupVisible && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            activeOpacity={1}
            onPress={() => setAddressPopupVisible(false)}
          />
          <View
            className="bg-[#FAF6F0] rounded-2xl mx-4 p-5"
            style={{
              marginTop: 70,
              maxHeight: Dimensions.get('window').height - keyboardHeight - 70 - 40,
            }}
          >
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-xl font-inter-extrabold text-[#1C1917]">Delivery Address</Text>
              <TouchableOpacity onPress={() => setAddressPopupVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={26} color="#1C1917" />
              </TouchableOpacity>
            </View>

            <AddressAutocomplete
              autoFocus
              defaultAddress={address}
              onAddressSelect={(selected) => {
                setAddress(selected);
                setAddressPopupVisible(false);
              }}
            />
          </View>
        </View>
      )}

      <CountryPickerSheet
        visible={countryPickerVisible}
        onClose={() => setCountryPickerVisible(false)}
        onSelect={(selected) => {
          setCountry(selected);
          setCountryPickerVisible(false);
        }}
        keyboardHeight={keyboardHeight}
      />
    </View>
  );
}
