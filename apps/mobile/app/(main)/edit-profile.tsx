import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Keyboard,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import AddressAutocomplete from '../../components/AddressAutocomplete';
import CountryPickerSheet from '../../components/CountryPickerSheet';
import ErrorBanner from '../../components/ErrorBanner';
import { Country, DEFAULT_COUNTRY, isValidPhoneForCountry, parsePhone } from '../../lib/countries';
import { isValidEmail } from '../../lib/passwordStrength';

export default function EditProfile() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuthStore();
  const userId = session?.user?.id;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState(session?.user?.email || '');
  const [loading, setLoading] = useState(false);
  const [formReady, setFormReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [addressPopupVisible, setAddressPopupVisible] = useState(false);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  useEffect(() => {
    if (profile && !formReady) {
      setFirstName(profile.first_name || '');
      setLastName(profile.last_name || '');
      const { country: parsedCountry, digits } = parsePhone(profile.phone || '');
      setCountry(parsedCountry);
      setPhone(digits);
      setAddress(profile.address || '');
      setFormReady(true);
    }
  }, [profile, formReady]);

  const handleSave = async () => {
    setErrorMessage(null);

    if (!firstName.trim() || !lastName.trim() || !phone.trim() || !address.trim() || !email.trim()) {
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

    setLoading(true);
    try {
      const { error: profileError } = await (supabase as any)
        .from('profiles')
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: `+${country.dialCode}${phone.trim()}`,
          address: address.trim(),
        })
        .eq('id', userId);
      if (profileError) throw profileError;

      const emailChanged = email.trim() !== session?.user?.email;
      if (emailChanged) {
        const { error: emailError } = await supabase.auth.updateUser({ email: email.trim() });
        if (emailError) throw emailError;
      }

      queryClient.invalidateQueries({ queryKey: ['profile', userId] });

      Alert.alert(
        emailChanged ? 'Confirm Your New Email' : 'Saved',
        emailChanged
          ? 'Your profile was updated. Check your inbox to confirm your new email address before it takes effect.'
          : 'Your profile was updated.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (e: any) {
      setErrorMessage(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (isLoading || !formReady) {
    return (
      <View className="flex-1 bg-[#FAF6F0] justify-center items-center">
        <ActivityIndicator size="large" color="#A61C14" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#FAF6F0]">
      <ScrollView
        className="flex-1 px-6 pt-16"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity onPress={() => router.back()} className="flex-row items-center py-2 pr-8 -ml-2 mb-4">
          <Ionicons name="chevron-back" size={28} color="#A61C14" />
          <Text className="text-[#A61C14] font-bold text-xl">Back</Text>
        </TouchableOpacity>

        <Text className="text-3xl font-extrabold text-[#1C1917] mb-6">Edit Profile</Text>

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
            <Text className="text-base font-semibold text-[#1C1917] mr-1">+{country.dialCode}</Text>
            <Ionicons name="chevron-down" size={14} color="#A8A29E" />
          </TouchableOpacity>
          <TextInput
            className="bg-white border border-stone-300 p-4 rounded-xl flex-1 text-base text-[#1C1917]"
            placeholder="Phone Number"
            placeholderTextColor="#A8A29E"
            keyboardType="phone-pad"
            value={phone}
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

        <TouchableOpacity
          className="bg-[#A61C14] p-4 rounded-xl mb-12 items-center shadow-md active:bg-[#85140E]"
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#F4ECE1" />
          ) : (
            <Text className="text-[#F4ECE1] text-center font-bold text-lg">Save Changes</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

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
              <Text className="text-xl font-extrabold text-[#1C1917]">Delivery Address</Text>
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
