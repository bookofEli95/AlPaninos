import Image from "next/image";
import { Gift, Sparkles, Star } from "lucide-react";

// The sign-in and join pages: the form on one side, a photo and what an
// account gets you on the other (big screens).
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-[calc(100dvh-var(--header-height))] lg:grid-cols-2">
      <div className="flex items-start justify-center bg-cream px-4 py-12 sm:px-6 lg:items-center lg:py-16">
        <div className="w-full max-w-md">{children}</div>
      </div>
      <div className="relative hidden overflow-hidden bg-ink lg:block">
        <Image src="/media/hero-poster.jpg" alt="" fill sizes="50vw" className="object-cover object-[50%_60%] opacity-70" priority />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-12 text-white">
          <p className="text-[13px] font-extrabold font-accent uppercase tracking-[0.16em] text-gold">PaninoPoints</p>
          <p className="mt-3 max-w-md font-display text-4xl font-extrabold leading-tight">Every order gets you closer to a free sandwich.</p>
          <ul className="mt-6 space-y-3 text-[16px] text-stone-200">
            <li className="flex items-center gap-3">
              <Star className="size-5 text-gold" aria-hidden />
              10 points for every $1, on the website and the app
            </li>
            <li className="flex items-center gap-3">
              <Gift className="size-5 text-gold" aria-hidden />
              Free dips, drinks, sides and sandwiches
            </li>
            <li className="flex items-center gap-3">
              <Sparkles className="size-5 text-gold" aria-hidden />
              A welcome spin and a birthday treat in the app
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export const authInput =
  "mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3.5 py-3 text-[15px] text-ink outline-none transition placeholder:text-stone-400 focus:border-brand focus:ring-4 focus:ring-brand/10";
export const authLabel = "text-xs font-bold uppercase tracking-wide text-stone-600";
export const authButton =
  "flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-4 text-[15px] font-extrabold uppercase tracking-wide text-white transition-colors hover:bg-brand-dark disabled:opacity-60";

// Only paths on this site -- never somewhere else after signing in.
export function safeNext(next: string | string[] | undefined, fallback = "/account"): string {
  const value = Array.isArray(next) ? next[0] : next;
  return value && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}
