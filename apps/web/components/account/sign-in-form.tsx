"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import GoogleButton, { OrDivider } from "./google-button";
import { authButton, authInput, authLabel } from "./auth-shell";
import { browserSupabase, friendlyAuthError } from "@/lib/browser-supabase";

type Mode = "signin" | "confirm" | "forgot" | "reset";

const CodeInput = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <input
    value={value}
    onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
    inputMode="numeric"
    autoComplete="one-time-code"
    placeholder="123456"
    aria-label="6-digit code"
    className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3.5 py-3 text-center font-mono text-2xl tracking-[0.4em] outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
  />
);

// Sign in with email and password (as in the app), with "Forgot password?"
// (a code by email, then a new password) and, for an email that was never
// confirmed, a fresh confirmation code.
export default function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const supabase = browserSupabase();

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(friendlyAuthError(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const signIn = () =>
    run(async () => {
      if (!email.trim() || !password) throw new Error("Enter your email and password.");
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError && (signInError.code === "email_not_confirmed" || /email not confirmed/i.test(signInError.message))) {
        const { error: resendError } = await supabase.auth.resend({ type: "signup", email: email.trim() });
        const justSent = !!resendError && /security purposes|seconds|rate limit/i.test(resendError.message);
        if (resendError && !justSent) throw resendError;
        setNote(justSent ? "Your email isn't confirmed yet. Use the code from the email we just sent." : "Your email isn't confirmed yet. We just sent you a new code.");
        setCode("");
        setMode("confirm");
        return;
      }
      if (signInError) throw signInError;
      router.replace(next);
      router.refresh();
    });

  const confirm = () =>
    run(async () => {
      const { error: verifyError } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: "signup" });
      if (verifyError) throw verifyError;
      router.replace(next);
    });

  const sendReset = () =>
    run(async () => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error("Enter the email you signed up with.");
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (resetError) throw resetError;
      setCode("");
      setMode("reset");
    });

  const reset = () =>
    run(async () => {
      if (newPassword.length < 6) throw new Error("Your new password needs at least 6 characters.");
      const { error: verifyError } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: "recovery" });
      if (verifyError) throw verifyError;
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword, data: { has_password: true } });
      if (updateError) throw updateError;
      router.replace(next);
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signin") signIn();
    else if (mode === "confirm") confirm();
    else if (mode === "forgot") sendReset();
    else reset();
  };

  const back = (
    <button
      type="button"
      onClick={() => {
        setMode("signin");
        setError(null);
        setNote(null);
      }}
      className="mb-6 inline-flex items-center gap-1.5 text-[14px] font-bold text-stone-600 hover:text-brand"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Back to sign in
    </button>
  );

  return (
    <form onSubmit={submit} noValidate>
      {mode !== "signin" && back}
      <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">
        {mode === "signin" ? "Sign in" : mode === "confirm" ? "Confirm your email" : mode === "forgot" ? "Reset your password" : "Choose a new password"}
      </h1>
      <p className="mt-2 text-[15px] text-stone-600">
        {mode === "signin" && "Welcome back. Your points, orders and favourites are waiting."}
        {mode === "confirm" && (note ?? "Enter the code we emailed you.")}
        {mode === "forgot" && "Enter your email and we'll send you a 6-digit code."}
        {mode === "reset" && (
          <>
            Enter the code we sent to <strong>{email.trim()}</strong> and your new password.
          </>
        )}
      </p>

      {mode === "signin" && (
        <>
          <div className="mt-8">
            <GoogleButton next={next} />
          </div>
          <OrDivider />
        </>
      )}

      <div className={`space-y-4 ${mode === "signin" ? "" : "mt-8"}`}>
        {(mode === "signin" || mode === "forgot") && (
          <label className="block">
            <span className={authLabel}>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={authInput} />
          </label>
        )}
        {mode === "signin" && (
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="signin-password" className={authLabel}>
                Password
              </label>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode("forgot");
                }}
                className="text-[13px] font-bold text-brand hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <input id="signin-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className={authInput} />
          </div>
        )}
        {(mode === "confirm" || mode === "reset") && (
          <label className="block">
            <span className={`${authLabel} flex items-center gap-1.5`}>
              <MailCheck className="size-3.5 text-brand" aria-hidden />
              Code from your email
            </span>
            <CodeInput value={code} onChange={setCode} />
          </label>
        )}
        {mode === "reset" && (
          <label className="block">
            <span className={authLabel}>New password</span>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" className={authInput} />
          </label>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-[14px] text-red-800 ring-1 ring-red-200" role="alert">
          {error}
        </p>
      )}

      <button type="submit" disabled={busy || ((mode === "confirm" || mode === "reset") && code.length !== 6)} className={`${authButton} mt-6`}>
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {mode === "signin" ? "Sign In" : mode === "confirm" ? "Confirm and Sign In" : mode === "forgot" ? "Send Code" : "Save and Sign In"}
      </button>

      {mode === "signin" && (
        <p className="mt-6 text-center text-[15px] text-stone-600">
          New to Al Panino&apos;s?{" "}
          <Link href={`/join${next !== "/account" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-bold text-brand hover:underline">
            Join PaninoPoints
          </Link>
        </p>
      )}
    </form>
  );
}
