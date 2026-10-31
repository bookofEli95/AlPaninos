import type { Metadata, Viewport } from "next";
import StaffScreen from "@/components/staff/staff-screen";

export const metadata: Metadata = { title: "Store Orders", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#1c1917" };

export default function StaffPage() {
  return <StaffScreen />;
}
