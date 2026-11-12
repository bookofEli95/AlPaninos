import Link from "next/link";
import RedPhoto from "./brand/red-photo";

// The dark band at the top of an inside page: where you are, the title and
// a line about it -- and room for actions alongside on big screens.
export default function PageBanner({
  crumb,
  title,
  intro,
  eyebrow,
  children,
}: {
  crumb: string;
  title: string;
  intro?: React.ReactNode;
  eyebrow?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden bg-ink text-white">
      {/* The shop's sign, faint in the brand red, fading into the dark. */}
      <div aria-hidden className="absolute inset-y-0 right-0 hidden w-2/3 opacity-45 md:block">
        <RedPhoto src="/media/storefront.jpg" alt="" sizes="66vw" position="50% 8%" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/60 to-ink/10" />
      </div>
      <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 md:py-14">
        <nav aria-label="Breadcrumb" className="text-[13px] text-stone-400">
          <Link href="/" className="hover:text-white">
            Home
          </Link>
          <span className="mx-2">/</span>
          <span className="text-white">{crumb}</span>
        </nav>
        <div className="mt-4 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            {eyebrow && <p className="text-[13px] font-extrabold uppercase tracking-[0.18em] text-gold">{eyebrow}</p>}
            <h1 className="mt-2 font-display text-5xl font-extrabold tracking-tight sm:text-6xl">{title}</h1>
            {intro && <div className="mt-4 text-lg leading-8 text-stone-300">{intro}</div>}
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}
