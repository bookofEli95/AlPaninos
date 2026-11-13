"use client";

import { Fragment, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { useOrdering } from "./ordering-provider";
import { cart, useCart } from "@/lib/cart";
import { appliedPromoFromRow, type PromoRow } from "@/lib/ordering/promo";
import { isDealUsed, useUsedDealCodes } from "@/lib/ordering/used-deals";

// A deal's button. One deal per order:
//   - not on the order: "Apply Deal" -- puts it on and heads to the menu
//     (the discount applies by itself once the order qualifies)
//   - another deal is on: "Swap to This Deal" -- replaces that one
//   - this deal is on: "Applied"; hovering says "Remove", and a click takes
//     it off (with Undo)
export default function ApplyDealButton({ deal, href, className, children }: { deal: PromoRow; href: string; className: string; children: ReactNode }) {
  const router = useRouter();
  const { notify } = useOrdering();
  const c = useCart();
  const current = c.promo;
  const applied = !!current && current.code.toLowerCase() === deal.code.toLowerCase();

  if (applied) {
    return (
      <button
        type="button"
        onClick={() => {
          cart.setPromo(null);
          notify(`${deal.title} was taken off your order.`, { label: "Undo", onClick: () => cart.setPromo(current) });
        }}
        // The deal's own button size and place, in green (red to remove).
        className={`${className} group inline-flex min-w-[9.5rem] items-center justify-center gap-1.5 bg-emerald-600! text-white! hover:bg-red-600! focus-visible:bg-red-600!`}
      >
        <span className="sr-only">{deal.title} is applied. Remove it</span>
        <span aria-hidden className="inline-flex items-center gap-1.5 group-hover:hidden group-focus-visible:hidden">
          <Check className="size-4" strokeWidth={3} />
          Applied
        </span>
        <span aria-hidden className="hidden items-center gap-1.5 group-hover:inline-flex group-focus-visible:inline-flex">
          <X className="size-4" strokeWidth={3} />
          Remove
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        cart.setPromo(appliedPromoFromRow(deal));
        notify(
          current
            ? `Swapped: ${deal.title} replaces ${current.title}. One deal per order.`
            : `${deal.title} is on your order. You'll see the savings at checkout.`
        );
        router.push(href);
      }}
      className={className}
    >
      {current ? "Swap to This Deal" : children}
    </button>
  );
}

// A list of deals without the ones already used (the first `limit` of
// them) -- or, when that's all of them, `empty`.
export function DealList({
  items,
  empty,
  className,
  limit,
  as: Tag = "ul",
}: {
  items: { key: string; code: string | null; singleUse?: boolean | null; node: ReactNode }[];
  empty: ReactNode;
  className: string;
  limit?: number;
  as?: "ul" | "div";
}) {
  const used = useUsedDealCodes();
  const shown = items.filter((i) => !isDealUsed({ code: i.code, single_use: i.singleUse }, used)).slice(0, limit);
  if (!shown.length) return <>{empty}</>;
  return (
    <Tag className={className}>
      {shown.map((i) => (
        <Fragment key={i.key}>{i.node}</Fragment>
      ))}
    </Tag>
  );
}
