"use client";

// A link to a section further down the page ("Start Your Order"). Scrolls
// there itself, so it works the same in every browser, and keeps the plain
// #link for anyone without JavaScript.
export default function JumpLink({ to, className, children }: { to: string; className?: string; children: React.ReactNode }) {
  return (
    <a
      href={`#${to}`}
      className={className}
      onClick={(e) => {
        const target = document.getElementById(to);
        if (!target) return;
        e.preventDefault();
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
        window.history.replaceState(window.history.state, "", `#${to}`);
      }}
    >
      {children}
    </a>
  );
}
