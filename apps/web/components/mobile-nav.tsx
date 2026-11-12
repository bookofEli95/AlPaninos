"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu as MenuIcon } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useSession } from "@/lib/browser-supabase";

// Phones and tablets: the site's sections behind a menu button. It opens
// without any script (a <details>); this closes it again when a link is
// followed, when the page is tapped anywhere else, or on Escape -- it used
// to stay open over the next page.
export default function MobileNav({ links }: { links: { href: string; label: string }[] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  const c = useCart();
  const { ready, isMember } = useSession();
  const close = () => ref.current?.removeAttribute("open");

  // A new page: closed.
  useEffect(close, [pathname]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current?.open) {
        close();
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <details ref={ref} className="relative lg:hidden">
      <summary
        className="flex size-11 cursor-pointer list-none items-center justify-center rounded-lg border border-stone-300 text-ink [&::-webkit-details-marker]:hidden"
        aria-label="Menu"
      >
        <MenuIcon className="size-5" aria-hidden />
      </summary>
      <nav aria-label="Main" className="absolute right-0 top-14 w-64 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl shadow-black/10">
        {links.map((item) => (
          // The same page again (Menu while on the menu) still closes it.
          <Link key={item.href} href={item.href} onClick={close} className="block border-b border-stone-100 px-5 py-3.5 text-sm font-extrabold uppercase tracking-wide text-ink hover:bg-cream">
            {item.label}
          </Link>
        ))}
        <div className="grid grid-cols-2 gap-2 p-3">
          <Link href={ready && isMember ? "/account" : "/signin"} onClick={close} className="rounded-lg border border-stone-300 py-2.5 text-center text-sm font-bold text-ink">
            {ready && isMember ? "My Account" : "Sign In"}
          </Link>
          <Link href={c.storeId ? `/menu?store=${c.storeId}&mode=${c.mode}` : "/menu"} onClick={close} className="rounded-lg bg-brand py-2.5 text-center text-sm font-bold text-white">
            Order Now
          </Link>
        </div>
      </nav>
    </details>
  );
}
