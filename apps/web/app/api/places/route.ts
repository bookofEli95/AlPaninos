import type { NextRequest } from "next/server";

// Delivery address suggestions from Google as you type, the same lookup the
// phone app uses. The key stays on the server (GOOGLE_PLACES_API_KEY). With
// no key, or when Google can't be reached, it answers { on: false } and the
// address boxes go back to taking whatever's typed, so ordering never stops.

type Prediction = {
  place_id: string;
  description: string;
  structured_formatting?: { main_text?: string; secondary_text?: string };
};

export async function GET(request: NextRequest) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return Response.json({ on: false, suggestions: [] });

  // Only for this site's own pages, so nobody else runs up the Google bill
  // through it.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return Response.json({ error: "Not allowed" }, { status: 403 });

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 3) return Response.json({ on: true, suggestions: [] });

  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.search = new URLSearchParams({
    input: q,
    // Street addresses in Canada, the ones near the stores (between
    // St. Thomas and London) first.
    types: "address",
    components: "country:ca",
    location: "42.88,-81.22",
    radius: "60000",
    language: "en",
    key,
  }).toString();

  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    const data: { status: string; error_message?: string; predictions?: Prediction[] } = await res.json();
    if (data.status === "OK" || data.status === "ZERO_RESULTS") {
      const suggestions = (data.predictions ?? []).slice(0, 5).map((p) => ({
        id: p.place_id,
        text: p.description,
        main: p.structured_formatting?.main_text ?? p.description,
        secondary: p.structured_formatting?.secondary_text ?? "",
      }));
      return Response.json({ on: true, suggestions }, { headers: { "Cache-Control": "private, max-age=300" } });
    }
    console.error("Address lookup:", data.status, data.error_message ?? "");
  } catch (e) {
    console.error("Address lookup failed:", e);
  }
  return Response.json({ on: false, suggestions: [] });
}
