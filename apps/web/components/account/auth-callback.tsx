"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { browserSupabase, useSession } from "@/lib/browser-supabase";

// Finishes a Google sign-in: the Supabase client picks the sign-in up from
// the address bar by itself; once it has, carry on to where they were going.
export default function AuthCallback({ next }: { next: string }) {
  const router = useRouter();
  const { ready, isMember } = useSession();
  const [error] = useState(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.hash.slice(1) || window.location.search).get("error_description")
  );
  useEffect(() => {
    if (ready && isMember) router.replace(next);
  }, [ready, isMember, next, router]);
  useEffect(() => {
    // Kick the client so it reads the URL even if nothing else has yet.
    browserSupabase().auth.getSession();
  }, []);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      {error ? (
        <>
          <p className="font-display text-2xl font-extrabold text-ink">Sign-in didn&apos;t finish</p>
          <p className="text-stone-600">{error}</p>
          <Link href="/signin" className="rounded-lg bg-brand px-6 py-3.5 text-[14px] font-extrabold uppercase tracking-wide text-white">
            Try Again
          </Link>
        </>
      ) : (
        <>
          <Loader2 className="size-8 animate-spin text-brand" aria-hidden />
          <p className="font-semibold text-stone-600">Signing you in...</p>
        </>
      )}
    </div>
  );
}
