import type { Metadata } from "next";
import { FileText } from "lucide-react";
import InfoPage from "@/components/info-page";

export const metadata: Metadata = {
  title: "Terms & Legal",
  description: "The terms for ordering from Al Paninos online and in the app.",
};

// Generic placeholder copy (the app's, apps/mobile/app/(main)/legal.tsx)
// -- have an actual lawyer review this before Al Paninos takes real
// orders and payments from the public.
const SECTIONS = [
  {
    heading: "Acceptance of Terms",
    body: "By using the Al Paninos website or app, you agree to these terms. If you do not agree, please do not use them.",
  },
  {
    heading: "Orders and Payment",
    body: "All orders are subject to availability and confirmation by the restaurant. Menu prices do not include tax, which is added at checkout. You pay when you pick up your order or when it is delivered. Orders may be cancelled by the restaurant if items become unavailable.",
  },
  {
    heading: "Catering",
    body: "Catering orders need to be placed by 6 PM the day before, and custom catering needs 48 hours' notice. We call to confirm the details of every catering order before we start preparing it.",
  },
  {
    heading: "Cancellations and Refunds",
    body: "To cancel or request a refund for an order, contact us as soon as possible from the Customer Support page. Once an order has entered preparation, a refund may not be possible.",
  },
  {
    heading: "Account Responsibility",
    body: "You are responsible for keeping your account information accurate and your login credentials secure.",
  },
  {
    heading: "Limitation of Liability",
    body: "Al Paninos is not liable for indirect or incidental damages arising from use of the website or app, to the extent permitted by law.",
  },
  {
    heading: "Changes to These Terms",
    body: "We may update these terms from time to time. Continued use of the website or app after changes means you accept the updated terms.",
  },
];

export default function TermsPage() {
  return (
    <InfoPage
      title="Terms & Legal"
      icon={FileText}
      updated="November 2026"
      intro="The terms for ordering from Al Paninos online and in the app: orders, refunds, and your account."
      sections={SECTIONS}
    />
  );
}
