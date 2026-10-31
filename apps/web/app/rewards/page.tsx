import type { Metadata } from "next";
import Link from "next/link";
import { Cake, Gift, ShoppingBag, Sparkles, Star, Users } from "lucide-react";
import PageBanner from "@/components/page-banner";
import MyRewards from "@/components/rewards/my-rewards";

export const metadata: Metadata = {
  alternates: { canonical: "/rewards" },
  title: "PaninoPoints Rewards",
  description: "Join PaninoPoints, free: earn 10 points for every $1 at Al Paninos and redeem them for free dips, drinks, specialty sides and signature sandwiches.",
};

const STEPS = [
  { Icon: ShoppingBag, title: "Order", text: "Order on the website or in the app while signed in." },
  { Icon: Star, title: "Earn", text: "10 points for every $1, added once your order is picked up or delivered." },
  { Icon: Gift, title: "Redeem", text: "Swap points for free food and add it to your next order." },
];

const FAQ = [
  { q: "How many points do I earn?", a: "10 PaninoPoints for every $1 of your order before tax, on pickup, delivery and catering orders." },
  { q: "When do my points arrive?", a: "As soon as the store marks your order picked up or delivered." },
  { q: "Can I earn as a guest?", a: "Verify your email at checkout and the points are saved to your email. Add a password afterwards to keep them and sign in anywhere." },
  { q: "How do I use a reward?", a: "Redeem it here or in the app, pick your free item, and it goes into your order at $0, options included." },
];

export default function RewardsPage() {
  return (
    <>
      <PageBanner crumb="Rewards" eyebrow="PaninoPoints" title="Eat. Earn. Repeat." intro="Free to join. Every order gets you closer to free food, plus a welcome spin, a birthday treat and $5 for every friend you bring.">
        <div className="flex gap-3">
          <Link href="/join" className="rounded-lg bg-gold px-6 py-3.5 text-[14px] font-extrabold uppercase tracking-wide text-ink hover:bg-white">
            Join for Free
          </Link>
          <Link href="/menu" className="rounded-lg px-6 py-3.5 text-[14px] font-extrabold uppercase tracking-wide text-white ring-1 ring-white/30 hover:bg-white/10">
            Start an Order
          </Link>
        </div>
      </PageBanner>
      <div className="bg-cream">
        <div className="mx-auto max-w-7xl space-y-16 px-4 py-12 sm:px-6">
          <section aria-labelledby="how">
            <h2 id="how" className="font-display text-3xl font-extrabold tracking-tight text-ink">How it works</h2>
            <ol className="mt-6 grid gap-4 md:grid-cols-3">
              {STEPS.map(({ Icon, title, text }, i) => (
                <li key={title} className="rounded-2xl bg-white p-6 ring-1 ring-stone-200">
                  <span className="flex items-center gap-3">
                    <span className="font-display text-4xl font-extrabold text-brand">{i + 1}</span>
                    <Icon className="size-6 text-ink" aria-hidden />
                  </span>
                  <h3 className="mt-3 text-xl font-bold text-ink">{title}</h3>
                  <p className="mt-1 text-[15px] leading-6 text-stone-600">{text}</p>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="redeem">
            <h2 id="redeem" className="font-display text-3xl font-extrabold tracking-tight text-ink">Your rewards</h2>
            <div className="mt-6">
              <MyRewards />
            </div>
          </section>

          <section aria-labelledby="extras" className="grid gap-4 md:grid-cols-3">
            <h2 id="extras" className="sr-only">More perks</h2>
            {[
              { Icon: Sparkles, title: "Welcome spin", text: "New members get a free spin for a prize in the Al Paninos app." },
              { Icon: Cake, title: "Birthday treat", text: "Add your birthday in the app and a treat arrives on your day." },
              { Icon: Users, title: "Give $5, get $5", text: "Friends save $5 on their first order of $15+. You get $5 when they order." },
            ].map(({ Icon, title, text }) => (
              <div key={title} className="rounded-2xl bg-brand p-6 text-white">
                <Icon className="size-7 text-gold" aria-hidden />
                <h3 className="mt-3 text-xl font-bold">{title}</h3>
                <p className="mt-1 text-[15px] leading-6 text-white/85">{text}</p>
              </div>
            ))}
          </section>

          <section aria-labelledby="faq" className="max-w-3xl">
            <h2 id="faq" className="font-display text-3xl font-extrabold tracking-tight text-ink">Questions</h2>
            <div className="mt-6 divide-y divide-stone-200 rounded-2xl bg-white ring-1 ring-stone-200">
              {FAQ.map(({ q, a }) => (
                <details key={q} className="group p-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold text-ink [&::-webkit-details-marker]:hidden">
                    {q}
                    <span className="text-xl text-brand transition-transform group-open:rotate-45" aria-hidden>
                      +
                    </span>
                  </summary>
                  <p className="mt-2 text-[15px] leading-6 text-stone-600">{a}</p>
                </details>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
