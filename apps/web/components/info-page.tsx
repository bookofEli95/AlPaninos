import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

export type InfoSection = { heading: string; body: string };

// A reading page (Privacy Policy, Terms): the title, a short intro, the
// sections numbered in one card, and a way to ask about it -- the same
// layout as the app's.
export default function InfoPage({
  title,
  intro,
  icon: Icon,
  updated,
  sections,
}: {
  title: string;
  intro: string;
  icon: LucideIcon;
  updated: string;
  sections: InfoSection[];
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-10 sm:px-6 md:pt-14">
      <h1 className="font-display text-[2.6rem] font-extrabold leading-none tracking-tight text-ink sm:text-6xl">{title}</h1>
      <p className="mt-3 text-sm font-semibold text-stone-500">Last updated {updated}</p>

      <div className="mt-8 flex items-center gap-4 rounded-2xl bg-ink p-5 text-cream-deep">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand">
          <Icon className="size-5 text-gold" aria-hidden />
        </span>
        <p className="text-[15px] leading-6">{intro}</p>
      </div>

      <ol className="mt-5 divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white px-5 sm:px-7">
        {sections.map((section, i) => (
          <li key={section.heading} className="flex gap-4 py-6">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-cream text-xs font-extrabold text-brand">
              {i + 1}
            </span>
            <div>
              <h2 className="font-bold text-ink">{section.heading}</h2>
              <p className="mt-1.5 text-[15px] leading-7 text-stone-600">{section.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <Link
        href="/support"
        className="group mt-5 flex items-center justify-between rounded-2xl border border-stone-200 bg-white px-5 py-4 font-semibold text-ink transition-colors hover:border-brand"
      >
        Questions? Contact Customer Support
        <ArrowRight className="size-4 text-brand transition-transform group-hover:translate-x-1" aria-hidden />
      </Link>
    </div>
  );
}
