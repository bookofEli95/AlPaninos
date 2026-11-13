import type { Metadata } from "next";
import CardFrame from "@/components/checkout/card-frame";

// The card boxes on their own, for the phone app to show inside its
// checkout (a web view) -- the same secure boxes as the website's.
export const metadata: Metadata = { title: "Card", robots: { index: false, follow: false } };

export default function CardPage() {
  return <CardFrame />;
}
