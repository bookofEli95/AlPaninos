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
  const meta = user.user_metadata ?? {};
  return !meta.has_password && !meta.first_name;
}
