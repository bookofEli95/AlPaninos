import React from 'react';
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Keyboard,
  Dimensions,
} from 'react-native';
import { Alert } from '../../lib/alert';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useLocationStore } from '../../store/locationStore';
import AddressAutocomplete from '../../components/AddressAutocomplete';
import CountryPickerSheet from '../../components/CountryPickerSheet';
import NotifyPreferenceToggle from '../../components/NotifyPreferenceToggle';
import ErrorBanner from '../../components/ErrorBanner';
import { Country, DEFAULT_COUNTRY, formatPhoneNumber, isValidPhoneForCountry, parsePhone } from '../../lib/countries';
import { isValidEmail } from '../../lib/passwordStrength';
import { useBackHandler } from '../../hooks/useBackHandler';
import { useCartBarSpace } from '../../hooks/useCartBarSpace';

// Profile opens this for one thing at a time: `section` 'details' (name and
// email), 'phone' or 'address'. With no section it's the whole form.
type Section = 'details' | 'phone' | 'address';
const TITLES: Record<Section, string> = {
  details: 'Personal Details',
  phone: 'Phone Number',
  address: 'Delivery Address',
};

export default function EditProfile() {
  const cartBarSpace = useCartBarSpace();
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section?: Section }>();
  const showDetails = !section || section === 'details';
  const showPhone = !section || section === 'phone';
  const showAddress = !section || section === 'address';
  const showNotify = !section;
  const queryClient = useQueryClient();
  const { session } = useAuthStore();
  const userId = session?.user?.id;
  const isAnonymous = session?.user?.is_anonymous ?? false;
  const locationId = useLocationStore((state) => state.locationId);

  // Reachable via the Profile screen's Edit button, but that screen itself
  // bounces guests away -- still guard this route directly too, since a
  // guest could otherwise reach it via a back gesture or stale navigation
  // state. There's no profile row worth editing for a guest.
  useEffect(() => {
    if (isAnonymous) {
      router.replace(locationId ? `/(main)/menu/${locationId}` : '/(main)');
    }
  }, [isAnonymous]);

  const goBackToProfile = useCallback(() => {
    router.replace('/(main)/profile');
  }, []);
  useBackHandler(goBackToProfile);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState(session?.user?.email || '');
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifySms, setNotifySms] = useState(false);
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
      const { data, error } = await (supabase as any).from('profiles').select('*').eq('id', userId).single();
      if (error) throw error;
      return data;
    },
    enabled: !isAnonymous && !!userId,
  });

  // This screen stays mounted between visits, so each visit starts again
  // from the saved profile (nothing half-typed from last time).
  useFocusEffect(
    useCallback(() => {
      setFormReady(false);
      setErrorMessage(null);
      setEmail(session?.user?.email || '');
    }, [section, session?.user?.email]),
  );

  useEffect(() => {
    if (profile && !formReady) {
      setFirstName(profile.first_name || '');
      setLastName(profile.last_name || '');
      const { country: parsedCountry, digits } = parsePhone(profile.phone || '');
      setCountry(parsedCountry);
      setPhone(digits);
      setAddress(profile.address || '');
      setNotifyEmail(profile.notify_email ?? true);
      setNotifySms(profile.notify_sms ?? false);
      setFormReady(true);
    }
  }, [profile, formReady]);

  // Save stays grey until something on screen differs from what's saved.
  const savedPhone = profile?.phone || '';
  const typedPhone = phone.trim() ? `+${country.dialCode}${phone.trim()}` : '';
  const dirty =
    !!profile &&
    ((showDetails &&
      (firstName.trim() !== (profile.first_name || '') ||
        lastName.trim() !== (profile.last_name || '') ||
        email.trim() !== (session?.user?.email || ''))) ||
      (showPhone && typedPhone !== savedPhone) ||
      (showAddress && address.trim() !== (profile.address || '')) ||
      showNotify);

  const handleSave = async () => {
    setErrorMessage(null);

    if (
      (showDetails && (!firstName.trim() || !lastName.trim() || !email.trim())) ||
      (showPhone && !phone.trim()) ||
      (showAddress && !address.trim())
    ) {
      setErrorMessage(section ? 'Please fill this in.' : 'Please fill out all fields.');
      return;
    }
    if (showDetails && !isValidEmail(email)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (showPhone && !isValidPhoneForCountry(phone, country)) {
      setErrorMessage(`Please enter a valid phone number for ${country.name}.`);
      return;
    }
    if (showNotify && !notifyEmail && !notifySms) {
      setErrorMessage('Choose at least one way to receive order updates.');
      return;
    }

    // Only what's on screen is saved.
    const changes: Record<string, any> = {};
    if (showDetails) {
      changes.first_name = firstName.trim();
      changes.last_name = lastName.trim();
    }
    if (showPhone) changes.phone = `+${country.dialCode}${phone.trim()}`;
    if (showAddress) changes.address = address.trim();
    if (showNotify) {
      changes.notify_email = notifyEmail;
      changes.notify_sms = notifySms;
    }

    setLoading(true);
    try {
      const { error: profileError } = await (supabase as any).from('profiles').update(changes).eq('id', userId);
      if (profileError) throw profileError;

      const emailChanged = showDetails && email.trim() !== session?.user?.email;
      if (emailChanged) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: email.trim(),
        });
        if (emailError) throw emailError;
      }

      queryClient.invalidateQueries({ queryKey: ['profile', userId] });

      Alert.alert(
        emailChanged ? 'Confirm Your New Email' : 'Saved',
        emailChanged
          ? 'Your profile was updated. Check your inbox to confirm your new email address before it takes effect.'
          : section === 'phone'
            ? 'Your phone number was updated.'
            : section === 'address'
              ? 'Your delivery address was updated.'
              : 'Your profile was updated.',
        [{ text: 'OK', onPress: goBackToProfile }],
      );
    } catch (e: any) {
      setErrorMessage(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (isAnonymous || isLoading || !formReady) {
    return (
      <View className="flex-1 bg-[#FAF6F0] justify-center items-center">
        <ActivityIndicator size="large" color="#A61C14" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-14">
      <View className="flex-row items-center px-4 mb-1">
        <TouchableOpacity
          onPress={goBackToProfile}
          className="py-2 pr-2 -ml-2"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={28} color="#A61C14" />
        </TouchableOpacity>
        <Text className="text-2xl font-display-bold text-[#1C1917] tracking-tight">
          {section ? TITLES[section] : 'Edit Profile'}
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-4"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: cartBarSpace + 32 }}
      >
        <Text className="text-sm text-stone-600 leading-5 mb-4 px-1">
          {section === 'phone'
            ? 'So the store can reach you about an order.'
            : section === 'address'
            ? 'Your usual delivery address -- you can still change it on any order.'
            : 'Your name, and the email you sign in with.'}
        </Text>

        {errorMessage && <ErrorBanner message={errorMessage} />}

        <View className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4">
          {showDetails && (
            <>
              <View className="flex-row" style={{ gap: 10 }}>
                <View className="flex-1">
                  <FieldLabel>First name</FieldLabel>
                  <FieldInput value={firstName} onChangeText={setFirstName} placeholder="First" autoComplete="given-name" />
                </View>
                <View className="flex-1">
                  <FieldLabel>Last name</FieldLabel>
                  <FieldInput value={lastName} onChangeText={setLastName} placeholder="Last" autoComplete="family-name" />
                </View>
              </View>
              <View className="mt-4">
                <FieldLabel>Email</FieldLabel>
                <FieldInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                />
                <Text className="text-xs text-[#78716C] mt-1.5 px-0.5">
                  Changing it? We'll email the new address a link to confirm it first.
                </Text>
              </View>
            </>
          )}

          {showPhone && (
            <View className={showDetails ? 'mt-4' : ''}>
              <FieldLabel>Phone number</FieldLabel>
              <View className="flex-row">
                <TouchableOpacity
                  onPress={() => setCountryPickerVisible(true)}
                  activeOpacity={0.8}
                  className="flex-row items-center bg-[#FAF6F0] border border-stone-200 rounded-xl px-3 mr-2"
                  accessibilityLabel={`Country code +${country.dialCode}`}
                >
                  <Text className="text-base mr-1">{country.flag}</Text>
                  <Text className="text-base font-inter-semibold text-[#1C1917] mr-1">+{country.dialCode}</Text>
                  <Ionicons name="chevron-down" size={14} color="#A8A29E" />
                </TouchableOpacity>
                <View className="flex-1">
                  <FieldInput
                    value={formatPhoneNumber(phone, country)}
                    onChangeText={(text) => setPhone(text.replace(/[^0-9]/g, ''))}
                    placeholder="Phone number"
                    keyboardType="phone-pad"
                    autoComplete="tel"
                  />
                </View>
              </View>
            </View>
          )}

          {showAddress && (
            <View className={showDetails || showPhone ? 'mt-4' : ''}>
              <FieldLabel>Delivery address</FieldLabel>
              <TouchableOpacity
                onPress={() => setAddressPopupVisible(true)}
                activeOpacity={0.8}
                className="flex-row items-center bg-[#FAF6F0] border border-stone-200 rounded-xl px-3.5 py-3.5"
              >
                <Ionicons name="location" size={18} color="#A61C14" />
                <Text
                  className="flex-1 ml-2.5 text-base"
                  style={{ color: address ? '#1C1917' : '#A8A29E' }}
                  numberOfLines={2}
                >
                  {address || 'Add your delivery address'}
                </Text>
                <Text className="text-[13px] font-inter-bold text-[#A61C14] ml-2">{address ? 'Change' : 'Add'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {showNotify && (
            <View className="mt-4">
              <NotifyPreferenceToggle
                notifyEmail={notifyEmail}
                notifySms={notifySms}
                onChangeEmail={setNotifyEmail}
                onChangeSms={setNotifySms}
              />
            </View>
          )}
        </View>

        <TouchableOpacity
          onPress={handleSave}
          disabled={loading || !dirty}
          activeOpacity={0.85}
          className="rounded-2xl py-4 mt-5 items-center flex-row justify-center"
          style={{ backgroundColor: dirty ? '#A61C14' : '#D6D3D1' }}
        >
          {loading ? (
            <ActivityIndicator color="#F4ECE1" />
          ) : (
            <>
              <Ionicons name="checkmark" size={18} color={dirty ? '#F4ECE1' : '#78716C'} />
              <Text className="font-inter-bold text-base ml-1.5" style={{ color: dirty ? '#F4ECE1' : '#78716C' }}>
                {dirty ? 'Save Changes' : 'No Changes Yet'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {addressPopupVisible && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
          }}
        >
          <TouchableOpacity
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
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
              <TouchableOpacity
                onPress={() => setAddressPopupVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
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

// A field's label, small and above it.
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text className="text-xs font-inter-bold uppercase tracking-wider text-stone-500 mb-1.5 px-0.5">{children}</Text>;
}

// A text field: soft fill, outlined in red while it's being typed in.
function FieldInput(props: React.ComponentProps<typeof TextInput>) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor="#A8A29E"
      {...props}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      style={{
        backgroundColor: focused ? '#FFFFFF' : '#FAF6F0',
        borderWidth: 1,
        borderColor: focused ? '#A61C14' : '#E7E5E4',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 13,
        fontSize: 16,
        color: '#1C1917',
        fontFamily: 'Inter_500Medium',
      }}
    />
  );
}
