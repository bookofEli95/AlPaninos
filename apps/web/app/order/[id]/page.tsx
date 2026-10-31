import type { Metadata } from "next";
import OrderTracker from "@/components/order/order-tracker";

export const metadata: Metadata = {
  title: "Your Order",
  robots: { index: false },
};

// An order's live status and receipt. It's private (read with the
// customer's own sign-in), so all of it happens in the browser.
export default async function OrderPage({ params, searchParams }: PageProps<"/order/[id]">) {
  const { id } = await params;
  const { placed } = await searchParams;
  return <OrderTracker id={id} placed={placed === "1"} />;
}
