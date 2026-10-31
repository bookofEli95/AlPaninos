import type { Store } from "./menu";
import { DAY_NAMES } from "./hours";

export const SITE_URL = "https://alpaninos.com";

// "525 Richmond St, London, ON N6A 3E8" -> street, city, province, postcode.
function postalAddress(address: string | null) {
  if (!address) return undefined;
  const [street, city, rest] = address.split(",").map((part) => part.trim());
  const match = rest?.match(/^([A-Z]{2})\s*([A-Z]\d[A-Z]\s?\d[A-Z]\d)?$/i);
  return {
    "@type": "PostalAddress",
    streetAddress: street,
    addressLocality: city,
    addressRegion: match?.[1] ?? "ON",
    ...(match?.[2] ? { postalCode: match[2].toUpperCase() } : {}),
    addressCountry: "CA",
  };
}

// Each store as a Restaurant for Google (local results, Maps, hours and
// "Order online" links), straight from the same data as the pages.
export function restaurantJsonLd(stores: Store[]) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "Al Paninos",
        url: SITE_URL,
        logo: `${SITE_URL}/logo.jpg`,
      },
      ...stores.map((store) => ({
        "@type": "Restaurant",
        "@id": `${SITE_URL}/locations#${store.id}`,
        name: `Al Paninos ${store.name}`,
        brand: { "@id": `${SITE_URL}/#organization` },
        url: `${SITE_URL}/locations`,
        image: `${SITE_URL}/media/hero-poster.jpg`,
        servesCuisine: ["Sandwiches", "Italian", "Paninos", "Wraps"],
        priceRange: "$$",
        acceptsReservations: false,
        hasMenu: `${SITE_URL}/menu?store=${store.id}`,
        ...(store.phone ? { telephone: store.phone } : {}),
        ...(store.address ? { address: postalAddress(store.address) } : {}),
        ...(store.latitude != null && store.longitude != null ? { geo: { "@type": "GeoCoordinates", latitude: store.latitude, longitude: store.longitude } } : {}),
        openingHoursSpecification: DAY_NAMES.flatMap((day) => {
          const hours = store.hours?.[day];
          return hours ? [{ "@type": "OpeningHoursSpecification", dayOfWeek: day.charAt(0).toUpperCase() + day.slice(1), opens: hours.open, closes: hours.close }] : [];
        }),
        potentialAction: {
          "@type": "OrderAction",
          target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/menu?store=${store.id}`, actionPlatform: ["http://schema.org/DesktopWebPlatform", "http://schema.org/MobileWebPlatform"] },
          deliveryMethod: ["http://purl.org/goodrelations/v1#DeliveryModePickUp", "http://purl.org/goodrelations/v1#DeliveryModeOwnFleet"],
        },
      })),
    ],
  };
}
