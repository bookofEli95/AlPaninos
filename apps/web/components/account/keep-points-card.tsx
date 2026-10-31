"use client";

import { useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { browserSupabase, friendlyAuthError } from "@/lib/browser-supabase";

// Set a password, so a guest who verified their email at checkout can sign
// back in (and keep their points) -- the app's "Keep This Order & Your Points".
export default function KeepPointsCard({ points }: { points?: number }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (done) {
    return (
      <div className="rounded-2xl bg-emerald-50 p-5 ring-1 ring-emerald-200">
        <p className="flex items-center gap-2 font-bold text-emerald-800">
          <Check className="size-5" aria-hidden />
          You&apos;re all set. Sign in with your email and new password any time.
        </p>
      </div>
    );
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (password.length < 6) return setError("Use at least 6 characters.");
        setBusy(true);
        const { error: updateError } = await browserSupabase().auth.updateUser({ password, data: { has_password: true } });
        setBusy(false);
        if (updateError) setError(friendlyAuthError(updateError.message));
        else setDone(true);
      }}
      className="rounded-2xl bg-ink p-6 text-white"
    >
      <p className="flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-[0.14em] text-gold">
        <Sparkles className="size-4" aria-hidden />
        Keep your points
      </p>
      <h3 className="mt-2 font-display text-2xl font-extrabold">Make it an account</h3>
      <p className="mt-1.5 text-[15px] text-stone-300">
        {points ? (
          <>
            This order earns <strong className="text-white">{points} PaninoPoints</strong>.{" "}
          </>
        ) : null}
        Add a password to keep your points and sign in on any device.
      </p>
      <div className="mt-4 flex gap-2">
        <label className="flex-1">
          <span className="sr-only">New password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="Choose a password"
            className="w-full rounded-lg bg-white px-3.5 py-3 text-[15px] text-ink outline-none focus:ring-4 focus:ring-gold/40"
          />
        </label>
        <button type="submit" disabled={busy} className="rounded-lg bg-gold px-5 text-[14px] font-extrabold uppercase tracking-wide text-ink hover:bg-white disabled:opacity-60">
          {busy ? <Loader2 className="size-4 animate-spin" aria-label="Saving" /> : "Save"}
        </button>
      </div>
      {error && <p className="mt-2 text-[14px] text-blush">{error}</p>}
    </form>
  );
}
