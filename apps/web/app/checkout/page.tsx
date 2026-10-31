import type { Metadata } from "next";
import Checkout from "@/components/checkout/checkout";
import { getStores } from "@/lib/menu";

// Store hours and tax rates stay current without a rebuild.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false },
};

export default async function CheckoutPage() {
  const stores = await getStores();
  return (
    <div className="bg-cream">
      <Checkout stores={stores} />
    </div>
  );
}
