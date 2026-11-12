"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CircleCheck, MapPin } from "lucide-react";
import { suggestAddresses, type AddressSuggestion } from "@/lib/places";

// A delivery address box that suggests real addresses from Google as you
// type, like the phone app. Picking one calls onPick; typing calls onType
// (that address isn't confirmed until one is picked). Arrow keys move
// through the list, Enter picks, Escape closes it.
export default function AddressInput({
  id,
  value,
  checked,
  onType,
  onPick,
  error,
  placeholder = "Street address, city",
  icon = false,
  dark = false,
  autoFocus = false,
  className = "",
}: {
  id: string;
  value: string;
  // Picked from the suggestions (shows a tick).
  checked: boolean;
  onType: (text: string) => void;
  onPick: (address: string) => void;
  error?: string | null;
  placeholder?: string;
  // A map pin inside the box, on the left.
  icon?: boolean;
  // Sits on a dark background (the menu banner).
  dark?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const listId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searched, setSearched] = useState("");
  // What's been typed since the last pick -- only that is looked up.
  const [query, setQuery] = useState<string | null>(null);

  useEffect(() => {
    const q = query?.trim() ?? "";
    if (q.length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const found = await suggestAddresses(q, controller.signal);
        // null: the lookup isn't available, so the box just takes what's typed.
        setItems(found ?? []);
        setSearched(found ? q : "");
        setActive(-1);
      } catch {
        // Typed again before the answer came back.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const pick = (s: AddressSuggestion) => {
    setQuery(null);
    setItems([]);
    setSearched("");
    setOpen(false);
    setActive(-1);
    onPick(s.text);
  };

  const showList = open && query !== null && items.length > 0;
  // Looked up and nothing came back. Said under the box, not in a list over
  // the page, so it never covers the button below.
  const noMatch = query !== null && items.length === 0 && searched !== "" && searched === query.trim();

  return (
    <div>
      <div className="relative">
        {icon && <MapPin className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-stone-400" aria-hidden />}
        <input
          ref={inputRef}
          id={id}
          value={value}
          onChange={(e) => {
            onType(e.target.value);
            setQuery(e.target.value);
            setOpen(true);
            // Too short to look up: no list.
            if (e.target.value.trim().length < 3) {
              setItems([]);
              setSearched("");
            }
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (!showList || !items.length) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const step = e.key === "ArrowDown" ? 1 : -1;
              setActive((i) => (i + step + items.length) % items.length);
            } else if (e.key === "Enter" && active >= 0) {
              e.preventDefault();
              pick(items[active]);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          autoFocus={autoFocus}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? errorId : undefined}
          className={`${className} ${icon ? "pl-10!" : ""} ${checked ? "pr-10!" : ""}`}
        />
        {checked && (
          <CircleCheck className="pointer-events-none absolute right-3.5 top-1/2 size-[18px] -translate-y-1/2 text-emerald-600" aria-label="Address found" />
        )}
        {showList && (
          <div className="absolute inset-x-0 top-full z-50 mt-1.5 overflow-hidden rounded-lg bg-white text-left text-ink shadow-xl shadow-black/15 ring-1 ring-stone-200">
            <ul id={listId} role="listbox" aria-label="Addresses">
              {items.map((s, i) => (
                <li
                  key={s.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  // Down, not click: keeps the box from losing focus first.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(s);
                  }}
                  // Only a real mouse move: a list opening under a still pointer
                  // shouldn't move the keyboard's place.
                  onMouseMove={() => active !== i && setActive(i)}
                  className={`flex cursor-pointer items-start gap-2.5 border-b border-stone-100 px-3.5 py-2.5 ${i === active ? "bg-cream" : ""}`}
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-bold">{s.main}</span>
                    {!!s.secondary && <span className="block truncate text-[12px] text-stone-500">{s.secondary}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="bg-stone-50 px-3.5 py-1.5 text-right text-[11px] text-stone-400">Powered by Google</p>
          </div>
        )}
      </div>
      {noMatch && !error && (
        <p role="status" className={`mt-1.5 text-[13px] font-semibold ${dark ? "text-amber-200" : "text-amber-700"}`}>
          No address found. Check the street number and town.
        </p>
      )}
      {!!error && (
        <p id={errorId} role="alert" className={`mt-1.5 text-[13px] font-semibold ${dark ? "text-red-300" : "text-red-600"}`}>
          {error}
        </p>
      )}
    </div>
  );
}
