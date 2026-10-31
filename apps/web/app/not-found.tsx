import Link from "next/link";

export default function NotFound() {
  return (
    <section className="grain bg-ink text-white">
      <div className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center px-4 py-20 text-center">
        <p className="font-display text-[7rem] font-extrabold leading-none text-gold sm:text-[9rem]">404</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">This page got eaten.</h1>
        <p className="mt-4 max-w-md text-lg text-stone-300">Whatever was here is gone, but the menu is right where we left it.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/menu" className="rounded-lg bg-brand px-7 py-4 text-[14px] font-extrabold uppercase tracking-wide text-white hover:bg-brand-dark">
            See the Menu
          </Link>
          <Link href="/" className="rounded-lg px-7 py-4 text-[14px] font-extrabold uppercase tracking-wide text-white ring-1 ring-white/30 hover:bg-white/10">
            Home
          </Link>
        </div>
      </div>
    </section>
  );
}
