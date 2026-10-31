"use client";

import { usePathname } from "next/navigation";

// The public header and footer -- everywhere except the store's order
// screen (/staff), which fills the tablet.
export default function SiteChrome({ header, footer, children }: { header: React.ReactNode; footer: React.ReactNode; children: React.ReactNode }) {
  const staff = usePathname().startsWith("/staff");
  return (
    <>
      {!staff && header}
      <main id="main" className="flex-1">
        {children}
      </main>
      {!staff && footer}
    </>
  );
}
