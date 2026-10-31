import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: [string, number][] = [
    ["", 1],
    ["/menu", 0.9],
    ["/catering", 0.8],
    ["/deals", 0.8],
    ["/locations", 0.8],
    ["/rewards", 0.7],
    ["/join", 0.5],
    ["/support", 0.4],
    ["/privacy", 0.2],
    ["/terms", 0.2],
  ];
  return pages.map(([path, priority]) => ({ url: `${SITE_URL}${path}`, changeFrequency: path === "/menu" || path === "/deals" ? "daily" : "weekly", priority }));
}
