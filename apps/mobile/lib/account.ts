import type { User } from '@supabase/supabase-js';

// A guest who verifies their email at checkout stops being anonymous
// (Supabase links the email to their session) but still has no password --
// if they sign out, they can't sign back in. Supabase doesn't expose
// whether a user has a password, so this reads the markers the app itself
// leaves: Sign Up (register.tsx) stores first_name in user_metadata, and
// finishing setup (AccountSetupSheet) stores has_password. Neither happens
// at guest checkout.
export function needsPassword(user: User | null | undefined): boolean {
  if (!user || user.is_anonymous) return false;
  // Signs in with Apple or Google -- there's no password to set.
  if (signsInWithProvider(user)) return false;
  const meta = user.user_metadata ?? {};
  return !meta.has_password && !meta.first_name;
}

// Signed in with Apple or Google (lib/socialSignIn.ts) rather than an email
// and password.
export function signsInWithProvider(user: User | null | undefined): boolean {
  if (!user) return false;
  const providers: string[] = (user.app_metadata?.providers as string[] | undefined) ?? [user.app_metadata?.provider ?? ''];
  return providers.some((p) => p === 'apple' || p === 'google');
}

// A full account still missing what an order needs: the customer's name
// and a phone number for the store to call. Happens after signing in with
// Apple or Google, which don't share a phone number.
export function needsOrderDetails(
  user: User | null | undefined,
  profile: { first_name?: string | null; last_name?: string | null; phone?: string | null } | null | undefined
): boolean {
  if (!user || user.is_anonymous || !profile) return false;
  return !profile.first_name?.trim() || !profile.last_name?.trim() || !profile.phone?.trim();
}
