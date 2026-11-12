// The website's side of the address lookup (app/api/places): suggestions
// for what's been typed, and whether the lookup is working at all. While
// it's working, a delivery address has to be one picked from the list;
// when it isn't (no key yet, Google down), a typed address is fine.

export type AddressSuggestion = { id: string; text: string; main: string; secondary: string };

let lookupOn: boolean | null = null;
let checking: Promise<boolean> | null = null;

// Suggestions for `q`, or null when the lookup isn't available.
export async function suggestAddresses(q: string, signal?: AbortSignal): Promise<AddressSuggestion[] | null> {
  const res = await fetch(`/api/places?q=${encodeURIComponent(q)}`, { signal });
  const data: { on?: boolean; suggestions?: AddressSuggestion[] } = await res.json().catch(() => ({}));
  lookupOn = !!data.on;
  return data.on ? data.suggestions ?? [] : null;
}

// Whether an address has to be picked from the suggestions.
export function addressLookupOn(): Promise<boolean> {
  if (lookupOn !== null) return Promise.resolve(lookupOn);
  checking ??= fetch("/api/places")
    .then((r) => r.json())
    .then((d: { on?: boolean }) => (lookupOn = !!d.on))
    .catch(() => false)
    .finally(() => (checking = null));
  return checking;
}
