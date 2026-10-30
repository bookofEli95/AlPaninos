import "server-only";
import { publicSupabase } from "./supabase";

// Store-wide deals (promotions): what the website advertises. Personal
// prizes (a user_id), free-item rewards (100% off) and expired deals are
// left out -- the same rules as the app's Deals tab.
export type Deal = {
  id: string;
  location_id: string | null;
  title: string;
  description: string | null;
  code: string | null;
  discount_percent: number | null;
  amount_off: number | null;
  min_order_amount: number | null;
  min_item_count: number | null;
  order_type: "pickup" | "delivery" | null;
  category_name: string | null;
  category_names: string[] | null;
  expires_at: string | null;
  user_id?: string | null;
};

export async function getDeals(storeId: string | null): Promise<Deal[]> {
  let query = publicSupabase().from("promotions").select("*").eq("is_active", true).is("user_id", null);
  query = storeId ? query.or(`location_id.eq.${storeId},location_id.is.null`) : query.is("location_id", null);
  const { data, error } = await query;
  if (error) throw error;
  const now = Date.now();
  return ((data ?? []) as Deal[])
    .filter((d) => Number(d.discount_percent) < 100)
    .filter((d) => !d.expires_at || new Date(d.expires_at).getTime() > now)
    .sort(
      (a, b) =>
        (Number(b.discount_percent) || 0) - (Number(a.discount_percent) || 0) ||
        (Number(b.amount_off) || 0) - (Number(a.amount_off) || 0)
    );
}

// The big number on a deal: "25% OFF", "$3 OFF", or "DEAL".
export function dealValue(deal: Deal): string {
  const pct = Number(deal.discount_percent) || 0;
  const amount = Number(deal.amount_off) || 0;
  if (pct > 0) return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}% OFF`;
  if (amount > 0) return `$${Number.isInteger(amount) ? amount : amount.toFixed(2)} OFF`;
  return "DEAL";
}

// The small print, in words: "Pickup orders · 2 or more · Orders over $20 ·
// Ends Oct 31".
export function dealTerms(deal: Deal): string[] {
  const terms: string[] = [];
  if (deal.order_type === "pickup") terms.push("Pickup orders");
  if (deal.order_type === "delivery") terms.push("Delivery orders");
  const min = Number(deal.min_item_count) || 0;
  if (min >= 2) terms.push(`When you get ${min} or more`);
  if (Number(deal.min_order_amount) > 0) terms.push(`Orders over $${Number(deal.min_order_amount).toFixed(0)}`);
  if (deal.expires_at) {
    const ends = new Date(deal.expires_at).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "America/Toronto" });
    terms.push(`Ends ${ends}`);
  }
  return terms;
}

// Which part of the menu a deal is on, if it's on one ("The Mob").
export function dealCategory(deal: Deal): string | null {
  return deal.category_names?.[0] ?? deal.category_name ?? null;
}
