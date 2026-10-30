"use client";

import { useEffect, useState } from "react";
import { storeStatus, type WeekHours } from "@/lib/hours";

// "Open until 9PM" / "Opens tomorrow at 11AM" with a green or grey dot.
// Worked out in the visitor's browser (on Ontario time), so a page that was
// built earlier never shows a stale "Open now".
export default function StoreStatus({ hours, tone = "light" }: { hours: WeekHours | null; tone?: "light" | "dark" }) {
  const [status, setStatus] = useState<{ open: boolean; label: string } | null>(null);

  useEffect(() => {
    const update = () => setStatus(storeStatus(hours));
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [hours]);

  if (!status?.label) return <span className="inline-block h-5" aria-hidden />;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
      <span className={`size-2 rounded-full ${status.open ? "bg-emerald-500" : "bg-stone-400"}`} aria-hidden />
      <span className={status.open ? (tone === "dark" ? "text-emerald-300" : "text-emerald-700") : tone === "dark" ? "text-stone-400" : "text-stone-500"}>
        {status.label}
      </span>
    </span>
  );
}
