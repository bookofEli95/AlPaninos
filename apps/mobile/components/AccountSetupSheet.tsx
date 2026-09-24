import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { isValidEmail } from '../lib/passwordStrength';
import { Country, DEFAULT_COUNTRY, formatPhoneNumber, isValidPhoneForCountry, parsePhone } from '../lib/countries';
import ErrorBanner from './ErrorBanner';
import CountryPickerSheet from './CountryPickerSheet';

// Turns the current session into a full account IN PLACE -- same user id, so
// the cart (keyed by user id, see cartStore), orders and everything else
// stay exactly where they are. Never signs out.
//
// mode 'upgrade': a guest (anonymous) session. Attaches an email (verified
//   with a 6-digit code, same "email_change" flow as guest checkout), then a
//   password, name and phone.
// mode 'finish': an account that already has a verified email but no
//   password or name -- what a guest becomes after verifying their email at
//   checkout. Just the password, name and phone.
type Props = {
  visible: boolean;
  mode: 'upgrade' | 'finish';
  onClose: () => void;
  onDone: () => void;
  initialValues?: { firstName?: string | null; lastName?: string | null; phone?: string | null };
};

const haptic = (type: Haptics.NotificationFeedbackType) => Haptics.notificationAsync(type).catch(() => {});

export default function AccountSetupSheet({ visible, mode, onClose, onDone, initialValues }: Props) {
  const queryClient = useQueryClient();
  const setSession = useAuthStore((state) => state.setSession);

  const [step, setStep] = useState<'form' | 'code'>('form');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  // Once the code has been accepted it can't be used again -- so if a later
  // step (password, profile) fails, a retry must skip straight past it.
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const parsed = parsePhone(initialValues?.phone || '');
    setStep('form');
    setFirstName(initialValues?.firstName || '');
    setLastName(initialValues?.lastName || '');
    setCountry(parsed.country);
    setPhoneDigits(parsed.digits);
    setPassword('');
    setCode('');
    setError(null);
  }, [visible]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const fail = (message: string) => {
    haptic(Haptics.NotificationFeedbackType.Error);
    setError(message);
  };

  const validateDetails = (): boolean => {
    if (!firstName.trim() || !lastName.trim() || !phoneDigits || !password || (mode === 'upgrade' && !email.trim())) {
      fail('Please fill in all fields.');
      return false;
    }
    if (!isValidPhoneForCountry(phoneDigits, country)) {
      fail(`Please enter a valid phone number for ${country.name}.`);
      return false;
    }
    if (mode === 'upgrade' && !isValidEmail(email)) {
      fail('Please enter a valid email address.');
      return false;
    }
    if (password.length < 6) {
      fail('Password must be at least 6 characters long.');
      return false;
    }
    return true;
  };

  // Password, then name/phone. Both errors are surfaced -- a silently failed
  // profile save would leave a nameless account whose checkouts send
  // "undefined undefined" to the kitchen.
  const saveAccountDetails = async () => {
    const phone = `+${country.dialCode}${phoneDigits}`;
    const { data: userData, error: pwdError } = await supabase.auth.updateUser({
      // Exactly as typed -- sign-in sends it untrimmed too (see login.tsx).
      password,
      // has_password: read by lib/account.ts's needsPassword().
      data: { first_name: firstName.trim(), last_name: lastName.trim(), phone, has_password: true },
    });
    if (pwdError) throw pwdError;
    const userId = userData.user?.id;
    if (!userId) throw new Error('Could not find your account. Please try again.');

    const { error: profileError } = await (supabase as any)
      .from('profiles')
      .upsert({ id: userId, first_name: firstName.trim(), last_name: lastName.trim(), phone }, { onConflict: 'id' });
    if (profileError) throw profileError;

    // Refresh so the session (and its is_anonymous flag) reflects the new
    // permanent account everywhere -- tabs, Profile, checkout.
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed.session) setSession(refreshed.session);
    queryClient.invalidateQueries({ queryKey: ['profile'] });
  };

  const handleSendCode = async () => {
    setError(null);
    if (!validateDetails()) return;
    setSubmitting(true);
    try {
      const { error: emailError } = await supabase.auth.updateUser({ email: email.trim() });
      if (emailError) {
        if (/already|registered|exists/i.test(emailError.message)) {
          throw new Error('That email already has an account. Close this and tap "Sign In" instead.');
        }
        throw emailError;
      }
      haptic(Haptics.NotificationFeedbackType.Success);
      setCode('');
      setStep('code');
    } catch (e: any) {
      fail(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinish = async () => {
    setError(null);
    // Details are (re)checked whenever they're being submitted from the form
    // -- always in 'finish' mode, and after "Edit details" in 'upgrade' mode.
    if ((mode === 'finish' || step === 'form') && !validateDetails()) return;
    if (mode === 'upgrade' && !emailConfirmed && code.trim().length !== 6) {
      fail('Enter the 6-digit code from your email.');
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'upgrade' && !emailConfirmed) {
        const { error: otpError } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: code.trim(),
          type: 'email_change',
        });
        if (otpError) throw otpError;
        setEmailConfirmed(true);
      }
      await saveAccountDetails();
      haptic(Haptics.NotificationFeedbackType.Success);
      onDone();
    } catch (e: any) {
      fail(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    if (!submitting) onClose();
  };

  const inputClass = 'bg-white border border-stone-300 rounded-xl px-3 py-2.5 text-sm text-[#1C1917]';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}
        >
          <View className="bg-[#FAF6F0] rounded-t-[32px] p-6 pb-10 border-t border-stone-200" style={{ maxHeight: '90%' }}>
            <View className="flex-row items-start justify-between mb-3">
              <View className="flex-1 mr-3">
                <Text className="text-xl font-display-bold text-[#1C1917] tracking-tight">
                  {step === 'code' ? 'Verify Your Email' : mode === 'upgrade' ? 'Create Your Account' : 'Finish Your Account'}
                </Text>
                <Text className="text-stone-500 text-xs mt-0.5">
                  {step === 'code'
                    ? emailConfirmed
                      ? 'Email verified -- tap below to finish setting up.'
                      : `Enter the 6-digit code sent to ${email.trim()}.`
                    : mode === 'upgrade'
                    ? 'Keep your cart and unlock member rewards.'
                    : 'Add your name, phone and a password so you can sign back in anytime.'}
                </Text>
              </View>
              <TouchableOpacity onPress={close} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color="#1C1917" />
              </TouchableOpacity>
            </View>

            {error && <ErrorBanner message={error} />}

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {step === 'form' ? (
                <View className="gap-2.5 mt-1">
                  <View className="flex-row gap-2">
                    <TextInput
                      className={`flex-1 ${inputClass}`}
                      placeholder="First Name"
                      placeholderTextColor="#A8A29E"
                      value={firstName}
                      onChangeText={setFirstName}
                      editable={!submitting}
                    />
                    <TextInput
                      className={`flex-1 ${inputClass}`}
                      placeholder="Last Name"
                      placeholderTextColor="#A8A29E"
                      value={lastName}
                      onChangeText={setLastName}
                      editable={!submitting}
                    />
                  </View>

                  <View className="flex-row">
                    <TouchableOpacity
                      onPress={() => setCountryPickerVisible(true)}
                      disabled={submitting}
                      className="flex-row items-center bg-white border border-stone-300 rounded-xl px-2.5 mr-2"
                    >
                      <Text className="text-sm mr-1">{country.flag}</Text>
                      <Text className="text-xs font-inter-semibold text-[#1C1917] mr-1">+{country.dialCode}</Text>
                      <Ionicons name="chevron-down" size={12} color="#A8A29E" />
                    </TouchableOpacity>
                    <TextInput
                      className={`flex-1 ${inputClass}`}
                      placeholder="Mobile Phone"
                      placeholderTextColor="#A8A29E"
                      keyboardType="phone-pad"
                      value={formatPhoneNumber(phoneDigits, country)}
                      onChangeText={(text) => setPhoneDigits(text.replace(/[^0-9]/g, ''))}
                      editable={!submitting}
                    />
                  </View>

                  {mode === 'upgrade' && (
                    <TextInput
                      className={inputClass}
                      placeholder="Email address"
                      placeholderTextColor="#A8A29E"
                      autoCapitalize="none"
                      keyboardType="email-address"
                      value={email}
                      onChangeText={(text) => {
                        setEmail(text);
                        // A different email needs its own code.
                        setEmailConfirmed(false);
                      }}
                      editable={!submitting}
                    />
                  )}

                  <TextInput
                    className={inputClass}
                    placeholder="Password (min 6 characters)"
                    placeholderTextColor="#A8A29E"
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                    editable={!submitting}
                  />

                  <TouchableOpacity
                    onPress={mode === 'upgrade' && !emailConfirmed ? handleSendCode : handleFinish}
                    disabled={submitting}
                    className="bg-[#A61C14] py-3.5 rounded-2xl items-center mt-2 shadow-sm active:bg-[#85140E]"
                  >
                    {submitting ? (
                      <ActivityIndicator color="#F4ECE1" size="small" />
                    ) : (
                      <Text className="text-[#F4ECE1] font-inter-bold text-sm">
                        {mode === 'upgrade' && !emailConfirmed ? 'Continue & Send Code' : 'Save & Finish'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <View className="mt-1">
                  {!emailConfirmed && (
                    <TextInput
                      className="bg-white border border-stone-300 rounded-xl px-3 py-3 text-base text-[#1C1917] text-center font-inter-bold tracking-widest mb-3"
                      placeholder="000000"
                      placeholderTextColor="#A8A29E"
                      keyboardType="number-pad"
                      maxLength={6}
                      value={code}
                      onChangeText={(text) => setCode(text.replace(/[^0-9]/g, ''))}
                      editable={!submitting}
                    />
                  )}

                  <TouchableOpacity
                    onPress={handleFinish}
                    disabled={submitting || (!emailConfirmed && code.trim().length !== 6)}
                    className={`py-3.5 rounded-2xl items-center mb-2.5 ${
                      submitting || (!emailConfirmed && code.trim().length !== 6)
                        ? 'bg-stone-300'
                        : 'bg-[#A61C14] active:bg-[#85140E]'
                    }`}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#F4ECE1" size="small" />
                    ) : (
                      <Text className="text-[#F4ECE1] font-inter-bold text-sm">
                        {emailConfirmed ? 'Finish Setup' : 'Verify & Create Account'}
                      </Text>
                    )}
                  </TouchableOpacity>

                  {!emailConfirmed && (
                    <View className="flex-row justify-center">
                      <TouchableOpacity onPress={handleSendCode} disabled={submitting} className="py-1.5 px-2">
                        <Text className="text-stone-500 text-xs font-inter-semibold">
                          Didn't get it? <Text className="text-[#A61C14]">Resend code</Text>
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setStep('form')} disabled={submitting} className="py-1.5 px-2">
                        <Text className="text-[#A61C14] text-xs font-inter-semibold">Edit details</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>

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
    </Modal>
  );
}
