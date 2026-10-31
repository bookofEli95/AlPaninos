"use client";

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";

// The browser's own connection to the app's database: it holds the
// customer's sign-in (a guest session, or their account), kept in this
// browser between visits, and everything it reads or writes goes through
// the same row-level security as the app.
let client: SupabaseClient | null = null;

export function browserSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "alpaninos-web-auth" },
    });
  }
  return client;
}

// ---- The current sign-in, shared by every component ----------------------

type SessionState = { session: Session | null; ready: boolean };
let state: SessionState = { session: null, ready: false };
const listeners = new Set<() => void>();
let started = false;

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  const supabase = browserSupabase();
  supabase.auth.getSession().then(({ data }) => {
    state = { session: data.session, ready: true };
    listeners.forEach((l) => l());
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    state = { session, ready: true };
    listeners.forEach((l) => l());
  });
}

const serverState: SessionState = { session: null, ready: false };

export function useSession() {
  const snapshot = useSyncExternalStore(
    (listener) => {
      start();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => serverState
  );
  const user = snapshot.session?.user ?? null;
  return {
    ...snapshot,
    user,
    // A guest: signed in for the order only, no account (yet).
    isGuest: !!user?.is_anonymous,
    // A real account (email, Google...).
    isMember: !!user && !user.is_anonymous,
  };
}

// A session to place an order or send a message with: the one there is, or
// a new guest session (the app's "Continue as Guest").
export async function ensureSession(): Promise<Session> {
  const supabase = browserSupabase();
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  const { data: anon, error } = await supabase.auth.signInAnonymously();
  if (error || !anon.session) throw error ?? new Error("Couldn't start a guest session. Please try again.");
  return anon.session;
}

// Supabase's error text, in words a customer can act on.
export function friendlyAuthError(message: string): string {
  if (/already (been )?registered|already exists|email_exists/i.test(message)) {
    return "That email already has an Al Paninos account. Sign in to order with it.";
  }
  if (/invalid login credentials/i.test(message)) return "That email and password don't match. Try again or reset your password.";
  if (/token has expired|invalid/i.test(message) && /token|otp|code/i.test(message)) return "That code is wrong or has expired. Check the email or send a new code.";
  if (/rate limit|security purposes|seconds/i.test(message)) return "Please wait a moment before asking for another code.";
  if (/password should be|at least 6/i.test(message)) return "Your password needs at least 6 characters.";
  return message;
}
