"use client";

import Link from "next/link";

// Anything that fails to load (the database unreachable for a moment, say):
// a way to try again instead of a blank page.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="bg-cream">
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 py-20 text-center">
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">Something went sideways.</h1>
        <p className="mt-3 text-lg text-stone-600">We couldn&apos;t load this page. Please try again in a moment.</p>
        <div className="mt-8 flex gap-3">
          <button type="button" onClick={reset} className="rounded-lg bg-brand px-7 py-4 text-[14px] font-extrabold uppercase tracking-wide text-white hover:bg-brand-dark">
            Try Again
          </button>
          <Link href="/" className="rounded-lg px-7 py-4 text-[14px] font-extrabold uppercase tracking-wide text-ink ring-1 ring-stone-300 hover:bg-white">
            Home
          </Link>
        </div>
      </div>
    </section>
  );
}
