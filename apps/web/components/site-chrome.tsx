"use client";

import { usePathname } from "next/navigation";

// The public header and footer -- everywhere except the store's order
// screen (/staff), which fills the tablet, and the card boxes the phone app
// shows inside its checkout (/pay/card).
export default function SiteChrome({ header, footer, children }: { header: React.ReactNode; footer: React.ReactNode; children: React.ReactNode }) {
  const path = usePathname();
  const bare = path.startsWith("/staff") || path.startsWith("/pay/card");
  return (
    <>
      {!bare && header}
      <main id="main" className="flex-1">
        {children}
      </main>
      {!bare && footer}
    </>
  );
}
