import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

// Sign in with Apple or Google, through Supabase. Either one makes the
// account on first use -- no password, no confirmation code. Their name
// comes from Apple/Google; the phone number they don't share is asked for
// before the first order (AccountSetupSheet's 'details' mode).
//
// Setup this needs (outside the app):
//   * Supabase > Authentication > Providers: Apple and Google turned on.
//   * Google: an OAuth client in Google Cloud, its ID and secret in Supabase.
//   * Apple: "Sign in with Apple" on the app's identifier, and the app's
//     bundle ID (plus host.exp.Exponent to try it in Expo Go) in Supabase.
//   * Supabase > Authentication > URL Configuration > Redirect URLs:
//     alpaninos://** and exp://** (Google sends the customer back there).

export type SignInResult = 'signed-in' | 'cancelled';

// Apple's sign-in exists on iPhones only.
export async function appleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return AppleAuthentication.isAvailableAsync().catch(() => false);
}

export async function signInWithApple(): Promise<SignInResult> {
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED') return 'cancelled';
    throw e;
  }
  if (!credential.identityToken) throw new Error("Apple didn't finish signing you in. Please try again.");

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;
  // Apple only shares the name the very first time.
  await fillProfileName(data.user, credential.fullName?.givenName, credential.fullName?.familyName);
  return 'signed-in';
}

export async function signInWithGoogle(): Promise<SignInResult> {
  // Where Google sends the customer back to: alpaninos://auth-callback in the
  // app (app/(auth)/auth-callback.tsx), an exp:// address in Expo Go.
  const redirectTo = Linking.createURL('auth-callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error) throw error;
  if (!data?.url) throw new Error("Couldn't open Google. Please try again.");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return 'cancelled';

  const params = paramsFromUrl(result.url);
  if (params.error || params.error_description) {
    throw new Error(params.error_description || params.error);
  }
  let user: User | null = null;
  if (params.code) {
    const { data: exchanged, error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
    if (exchangeError) throw exchangeError;
    user = exchanged.user;
  } else if (params.access_token && params.refresh_token) {
    const { data: session, error: sessionError } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (sessionError) throw sessionError;
    user = session.user;
  } else {
    throw new Error("Google didn't finish signing you in. Please try again.");
  }

  const meta = user?.user_metadata ?? {};
  const [first, ...rest] = String(meta.full_name ?? meta.name ?? '').trim().split(/\s+/);
  await fillProfileName(user, meta.given_name ?? first, meta.family_name ?? rest.join(' '));
  return 'signed-in';
}

// The values after ? and # in the address Google sent back.
export function paramsFromUrl(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const parts = [url.split('#')[1], url.split('#')[0].split('?')[1]];
  parts.forEach((part) => {
    (part ?? '').split('&').forEach((pair) => {
      if (!pair) return;
      const [key, ...value] = pair.split('=');
      try {
        params[decodeURIComponent(key)] = decodeURIComponent(value.join('=').replace(/\+/g, ' '));
      } catch {
        params[key] = value.join('=');
      }
    });
  });
  return params;
}

// A new account's name from Apple/Google -- only where it's still blank, so
// a name the customer set themselves is never overwritten.
async function fillProfileName(user: User | null | undefined, first?: string | null, last?: string | null) {
  if (!user || (!first?.trim() && !last?.trim())) return;
  try {
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', user.id)
      .maybeSingle();
    const changes: Record<string, string> = {};
    if (!profile?.first_name?.trim() && first?.trim()) changes.first_name = first.trim();
    if (!profile?.last_name?.trim() && last?.trim()) changes.last_name = last.trim();
    if (Object.keys(changes).length > 0) {
      await (supabase as any).from('profiles').update(changes).eq('id', user.id);
    }
  } catch {
    // Not worth failing the sign-in over -- they're asked before ordering.
  }
}
