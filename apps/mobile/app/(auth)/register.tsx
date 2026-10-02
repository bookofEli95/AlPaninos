import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Keyboard,
  Dimensions
} from 'react-native';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import AddressAutocomplete from '../../components/AddressAutocomplete';
import CountryPickerSheet from '../../components/CountryPickerSheet';
import NotifyPreferenceToggle from '../../components/NotifyPreferenceToggle';
import ErrorBanner from '../../components/ErrorBanner';
import SignupCodeSheet from '../../components/SignupCodeSheet';
import SocialSignInButtons from '../../components/SocialSignInButtons';
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
  // Set once the sign-up email (with its 6-digit code) has gone out.
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
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

    // The address is optional: most orders are pickup, and choosing
    // Delivery asks for one anyway (OrderTypeSheet).
    if (!firstName.trim() || !lastName.trim() || !phone.trim() || !email.trim() || !password.trim()) {
      setErrorMessage('Please fill out your name, phone number, email and password.');
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

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: password,
      options: {
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: `+${country.dialCode}${phone.trim()}`,
          address: address.trim() || null,
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
    // Supabase answers "success" for an email that already has an account
    // (so sign-up can't be used to find out who's registered) -- but sends
    // nothing. An account with no sign-in identities is that case.
    if (data.user && data.user.identities?.length === 0) {
      setErrorMessage('An account with this email already exists. Sign in instead, or use Forgot Password.');
      return;
    }
    // Email confirmation switched off: already signed in, and the root
    // layout moves on by itself.
    if (data.session) return;

    setCodeSentTo(email.trim());
  };

  // The same food video behind a dark wash as the sign-in screen, so
  // signing up feels like the same place.
  const videoPlayer = useVideoPlayer(require('../../assets/videos/login-background.mp4'), (player) => {
    player.loop = true;
    player.muted = true;
    player.play();
  });

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
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }}
        pointerEvents="none"
      />
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
          <Text className="text-3xl font-display-bold text-[#F4ECE1]">Create Account</Text>
          <View className="flex-row items-center bg-[#FFC72C] px-3.5 py-1.5 rounded-full mt-3">
            <Ionicons name="gift" size={14} color="#7A0E0A" />
            <Text className="text-[#7A0E0A] font-inter-bold text-[13px] ml-1.5">
              Free spin to win + 10 points per $1
            </Text>
          </View>
        </View>

        {errorMessage && <ErrorBanner message={errorMessage} />}

        {/* The quickest way: Apple (iPhone) or Google, no password */}
        <SocialSignInButtons disabled={loading} onError={(message) => setErrorMessage(message)} />
        <View className="flex-row items-center my-5">
          <View className="flex-1 h-[1px] bg-white/20" />
          <Text className="text-[#F4ECE1]/60 font-inter-medium text-xs px-3">or sign up with email</Text>
          <View className="flex-1 h-[1px] bg-white/20" />
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
            <Text style={{ color: strength.color }} className="text-[13px] font-inter-bold mt-1">
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
            {address || 'Delivery address (optional)'}
          </Text>
        </TouchableOpacity>

        {/* On a light card so its labels read over the video */}
        <View className="bg-[#FAF6F0] rounded-2xl px-4 pt-4 mb-4">
          <NotifyPreferenceToggle
            notifyEmail={notifyEmail}
            notifySms={notifySms}
            onChangeEmail={setNotifyEmail}
            onChangeSms={setNotifySms}
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
            <Text className="text-[#F4ECE1] text-center font-display text-lg">Sign Up</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} className="mb-12 py-2">
          <Text className="text-[#F4ECE1] text-center text-base font-inter-semibold">
            Already have an account? <Text className="underline font-inter-bold">Sign In</Text>
          </Text>
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

      <SignupCodeSheet
        visible={!!codeSentTo}
        email={codeSentTo ?? ''}
        onClose={() => setCodeSentTo(null)}
        intro="Almost done!"
      />
    </View>
  );
}
