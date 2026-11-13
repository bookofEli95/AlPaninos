"use client";

import { useEffect, useRef } from "react";
import { paymentProvider } from "@/lib/payments";
import { CardBox, type CardBoxHandle } from "./payment-block";

type AppMessage = { type: "ready" } | { type: "unavailable" } | { type: "height"; height: number } | { type: "token"; token: string } | { type: "error"; error: string };

// Talks to the phone app through its web view: says when it's ready and how
// tall it is, and when the app asks (window.__alpTokenize) sends back the
// card's one-time token -- or what's wrong with what was typed.
export default function CardFrame() {
  const provider = paymentProvider();
  const card = useRef<CardBoxHandle>(null);

  useEffect(() => {
    const w = window as unknown as { ReactNativeWebView?: { postMessage: (m: string) => void }; __alpTokenize?: () => Promise<void> };
    const post = (m: AppMessage) => w.ReactNativeWebView?.postMessage(JSON.stringify(m));
    w.__alpTokenize = async () => {
      const r = await card.current?.tokenize();
      post(!r ? { type: "error", error: "The card form didn't load. Please try again." } : "error" in r ? { type: "error", error: r.error } : { type: "token", token: r.token });
    };
    post({ type: provider ? "ready" : "unavailable" });
    const sendHeight = () => post({ type: "height", height: Math.ceil(document.getElementById("card-frame")?.getBoundingClientRect().height ?? 0) });
    const watch = new ResizeObserver(sendHeight);
    const el = document.getElementById("card-frame");
    if (el) watch.observe(el);
    sendHeight();
    return () => {
      watch.disconnect();
      delete w.__alpTokenize;
    };
  }, [provider]);

  return (
    <div id="card-frame" className="bg-white p-1">
      {provider ? <CardBox provider={provider} ref={card} /> : <p className="p-3 text-[14px] text-stone-600">Card payments aren&apos;t set up yet.</p>}
    </div>
  );
}
