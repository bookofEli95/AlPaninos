import Image from "next/image";
import Link from "next/link";

// The AP roundel and the name, linking home.
export default function BrandMark({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label="Al Paninos home">
      <Image
        src="/logo.jpg"
        alt=""
        width={40}
        height={40}
        priority
        className="size-10 rounded-full shadow-sm ring-1 ring-black/5 transition-transform duration-300 group-hover:-rotate-6"
      />
      <span
        className={`font-display text-[1.35rem] font-extrabold tracking-tight ${tone === "light" ? "text-cream-deep" : "text-ink"}`}
      >
        Al Paninos
      </span>
    </Link>
  );
}
