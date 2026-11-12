import Link from "next/link";
import { ApBadge, Wordmark } from "./brand/marks";

// The AP stamp and the AL PANINOS wordmark, linking home.
export default function BrandMark({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return (
    <Link href="/" className="group flex shrink-0 items-center gap-2.5 sm:gap-3" aria-label="Al Paninos home">
      <ApBadge className="size-10 transition-transform duration-300 group-hover:-rotate-6 sm:size-12" />
      <Wordmark className={`h-[21px] w-auto sm:h-[25px] ${tone === "light" ? "text-paper" : "text-ink"}`} />
    </Link>
  );
}
