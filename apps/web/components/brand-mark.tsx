import Image from "next/image";
import Link from "next/link";

// The AP roundel and the name, linking home.
export default function BrandMark({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return (
    <Link href="/" className="group flex shrink-0 items-center gap-2 sm:gap-2.5" aria-label="Al Paninos home">
      <Image
        src="/logo.jpg"
        alt=""
        width={48}
        height={48}
        priority
        className="size-10 rounded-full transition-transform duration-300 group-hover:-rotate-6 sm:size-12"
      />
      <span
        className={`font-display text-[1.3rem] font-extrabold leading-none tracking-tight sm:text-[1.55rem] ${tone === "light" ? "text-white" : "text-ink"}`}
      >
        Al Paninos
      </span>
    </Link>
  );
}
