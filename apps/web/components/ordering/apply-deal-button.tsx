"use client";

import { useRouter } from "next/navigation";
import { useOrdering } from "./ordering-provider";
import { cart } from "@/lib/cart";
import { appliedPromoFromRow, type PromoRow } from "@/lib/ordering/promo";

// "Apply Deal": puts the deal on the order (the discount applies by itself
// once the order qualifies, as in the app) and heads to the menu.
export default function ApplyDealButton({ deal, href, className, children }: { deal: PromoRow; href: string; className: string; children: React.ReactNode }) {
  const router = useRouter();
  const { notify } = useOrdering();
  return (
    <button
      type="button"
      onClick={() => {
        cart.setPromo(appliedPromoFromRow(deal));
        notify(`${deal.title} is on your order. You'll see the savings at checkout.`);
        router.push(href);
      }}
      className={className}
    >
      {children}
    </button>
  );
}
