"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Gift, Loader2, MailCheck } from "lucide-react";
import GoogleButton, { OrDivider } from "./google-button";
import { authButton, authInput, authLabel } from "./auth-shell";
import { browserSupabase, friendlyAuthError } from "@/lib/browser-supabase";
import { COUNTRIES, DEFAULT_COUNTRY, formatPhoneNumber, isValidPhoneForCountry, type Country } from "@/lib/ordering/countries";

// The app's password strength meter.
function strength(password: string) {
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 1) return { label: "Weak", color: "bg-red-600", width: "w-1/3" };
  if (score <= 3) return { label: "Medium", color: "bg-amber-500", width: "w-2/3" };
  return { label: "Strong", color: "bg-emerald-600", width: "w-full" };
}

// Join PaninoPoints: the app's Sign Up -- name, phone, email, password and
// how they'd like order updates -- then the 6-digit code from the email.
export default function JoinForm({ next }: { next: string }) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifySms, setNotifySms] = useState(false);
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const supabase = browserSupabase();
  const meter = strength(password);

  const signUp = async () => {
    if (!firstName.trim() || !lastName.trim() || !phone.trim() || !email.trim() || !password) throw new Error("Fill in your name, phone number, email and a password.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error("Enter a valid email address.");
    if (!isValidPhoneForCountry(phone, country)) throw new Error(`Enter a valid phone number for ${country.name}.`);
    if (!notifyEmail && !notifySms) throw new Error("Choose at least one way to get order updates.");
    if (password.length < 6) throw new Error("Your password needs at least 6 characters.");
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: `+${country.dialCode}${phone}`,
          address: null,
          notify_email: notifyEmail,
          notify_sms: notifySms,
        },
      },
    });
    if (signUpError) throw signUpError;
    // Supabase answers "success" for an email that already has an account,
    // but with no sign-in identities -- and sends nothing.
    if (data.user && data.user.identities?.length === 0) throw new Error("An account with this email already exists. Sign in instead, or reset your password.");
    if (data.session) {
      setDone(true);
      return;
    }
    setCodeSentTo(email.trim());
  };

  const verify = async () => {
    const { error: verifyError } = await supabase.auth.verifyOtp({ email: codeSentTo!, token: code, type: "signup" });
    if (verifyError) throw verifyError;
    setDone(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await (codeSentTo ? verify() : signUp());
    } catch (err) {
      setError(friendlyAuthError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="text-center">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-brand text-white">
          <Gift className="size-8" aria-hidden />
        </span>
        <h1 className="mt-6 font-display text-4xl font-extrabold tracking-tight text-ink">Welcome, {firstName.trim()}!</h1>
        <p className="mt-3 text-[16px] text-stone-600">You&apos;re in. Every order now earns 10 PaninoPoints per $1, and your welcome spin is waiting in the Al Paninos app.</p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => router.replace(next === "/account" ? "/menu" : next)} className={authButton}>
            {next === "/checkout" ? "Back to Checkout" : "Start an Order"}
          </button>
          <Link href="/account" className="flex items-center justify-center rounded-lg py-4 text-[15px] font-extrabold uppercase tracking-wide text-ink ring-1 ring-stone-300 hover:bg-white">
            My Account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">{codeSentTo ? "Check your email" : "Join PaninoPoints"}</h1>
      <p className="mt-2 text-[15px] text-stone-600">
        {codeSentTo ? (
          <>
            We sent a 6-digit code to <strong>{codeSentTo}</strong>. Enter it to finish creating your account.
          </>
        ) : (
          "Free to join. Earn on every order, here and in the app."
        )}
      </p>

      {codeSentTo ? (
        <label className="mt-8 block">
          <span className={`${authLabel} flex items-center gap-1.5`}>
            <MailCheck className="size-3.5 text-brand" aria-hidden />
            Code from your email
          </span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3.5 py-3 text-center font-mono text-2xl tracking-[0.4em] outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
          />
        </label>
      ) : (
        <>
          <div className="mt-8">
            <GoogleButton next={next} />
          </div>
          <OrDivider />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={authLabel}>First name</span>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" className={authInput} />
            </label>
            <label className="block">
              <span className={authLabel}>Last name</span>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" className={authInput} />
            </label>
            <div className="sm:col-span-2">
              <span className={authLabel}>Mobile number</span>
              <div className="mt-1.5 flex gap-2">
                <select
                  value={country.code}
                  onChange={(e) => setCountry(COUNTRIES.find((x) => x.code === e.target.value) ?? DEFAULT_COUNTRY)}
                  aria-label="Country code"
                  className="w-28 rounded-lg border border-stone-300 bg-white px-2.5 text-[15px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
                >
                  {COUNTRIES.map((x) => (
                    <option key={x.code} value={x.code}>
                      {x.flag} +{x.dialCode}
                    </option>
                  ))}
                </select>
                <input
                  value={formatPhoneNumber(phone, country)}
                  onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, "").slice(0, country.maxLength))}
                  inputMode="tel"
                  autoComplete="tel-national"
                  aria-label="Mobile number"
                  className="w-full rounded-lg border border-stone-300 bg-white px-3.5 py-3 text-[15px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
                />
              </div>
            </div>
            <label className="block sm:col-span-2">
              <span className={authLabel}>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={authInput} />
            </label>
            <label className="block sm:col-span-2">
              <span className={authLabel}>Password</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className={authInput} />
              {password && (
                <span className="mt-2 flex items-center gap-3">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-200">
                    <span className={`block h-full ${meter.color} ${meter.width} transition-all`} />
                  </span>
                  <span className="text-[12px] font-bold text-stone-500">{meter.label}</span>
                </span>
              )}
            </label>
          </div>
          <fieldset className="mt-5">
            <legend className={authLabel}>Send me order updates by</legend>
            <div className="mt-2 flex gap-3">
              {(
                [
                  ["Email", notifyEmail, setNotifyEmail],
                  ["Text", notifySms, setNotifySms],
                ] as const
              ).map(([label, on, set]) => (
                <label key={label} className={`flex flex-1 cursor-pointer items-center gap-2.5 rounded-lg bg-white px-3.5 py-3 ring-1 ${on ? "ring-2 ring-brand" : "ring-stone-300"}`}>
                  <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="sr-only" />
                  <span className={`flex size-5 items-center justify-center rounded-md border ${on ? "border-brand bg-brand" : "border-stone-300"}`} aria-hidden>
                    {on && <Check className="size-3.5 text-white" strokeWidth={3} />}
                  </span>
                  <span className="text-[15px] font-semibold text-ink">{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-[14px] text-red-800 ring-1 ring-red-200" role="alert">
          {error}{" "}
          {/already exists/.test(error) && (
            <Link href="/signin" className="font-bold underline">
              Sign in
            </Link>
          )}
        </p>
      )}

      <button type="submit" disabled={busy || (!!codeSentTo && code.length !== 6)} className={`${authButton} mt-6`}>
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {codeSentTo ? "Confirm and Join" : "Create My Account"}
      </button>
      {!codeSentTo && (
        <p className="mt-4 text-center text-[13px] text-stone-500">
          By joining you agree to our{" "}
          <Link href="/terms" className="underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
      )}
      <p className="mt-6 text-center text-[15px] text-stone-600">
        Already a member?{" "}
        <Link href="/signin" className="font-bold text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
