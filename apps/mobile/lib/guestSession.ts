import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { useRouter } from 'expo-router';
import { supabase } from './supabase';
import { useAuthStore } from '../store/authStore';

// Guest-session actions shared by More and the Profile tab's guest view.

type Router = ReturnType<typeof useRouter>;

export async function signOutToLogin(router: Router) {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  await supabase.auth.signOut().catch(console.warn);
  useAuthStore.getState().setSession(null);
  router.replace('/(auth)/login');
}

// Signing in to a different, existing account can't keep this guest
// session's cart -- the cart belongs to the guest's user id (see
// cartStore), and signing in switches to another one.
export function confirmSwitchToExistingAccount(router: Router) {
  Alert.alert(
    'Sign In to Your Account',
    'Signing in ends this guest session, and anything in your cart now will not carry over.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Continue to Sign In', style: 'destructive', onPress: () => signOutToLogin(router) },
    ]
  );
}

// After a guest creates an account: its welcome spin is waiting
// (has_spun_wheel starts false, and claim_wheel_prize() only needs the
// account to no longer be anonymous, which it now isn't).
export function welcomeNewAccount(router: Router) {
  Alert.alert('Account Created!', 'Your cart is saved to your new account, and your welcome spin is waiting.', [
    { text: 'Later', style: 'cancel' },
    { text: 'Spin the Wheel', onPress: () => router.replace('/(main)/spin-wheel') },
  ]);
}
