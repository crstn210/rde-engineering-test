import listingsData from "../../data/listings.json";

export type Listing = {
  id: string;
  slug: string;
  address: string;
  unit: string;
  submarket: string;
  sf: number;
  pricePerSf: number;
  availability: string;
  type: "direct" | "sublease";
  condition: string;
  features: string[];
  description: string;
  heroImage: string;
  photos: string[];
  floorplan: string;
  buildingClass: string;
  yearBuilt: number;
};

// Canonical submarket names. Fixes the intentional "Grand Central" vs
// "Grand Central Area" inconsistency documented in README "Known quirks".
// Midtown East is a distinct submarket — do not alias it to Grand Central.
const SUBMARKET_ALIASES: Record<string, string> = {
  "grand central": "Grand Central",
  "grand central area": "Grand Central",
};

export function canonicalSubmarket(raw: string): string {
  const key = raw.trim().toLowerCase();
  return SUBMARKET_ALIASES[key] ?? raw.trim();
}

const RAW_LISTINGS = listingsData as Listing[];

export const ALL_LISTINGS: Listing[] = RAW_LISTINGS.map((l) => ({
  ...l,
  submarket: canonicalSubmarket(l.submarket),
}));

export const ALL_SUBMARKETS: string[] = Array.from(
  new Set(ALL_LISTINGS.map((l) => l.submarket))
).sort();

export type SearchFilter = {
  submarket?: string;
  sfMin?: number;
  sfMax?: number;
  features?: string[];
  subleaseOrDirect?: "direct" | "sublease" | "any";
};

export function filterListings(filter: SearchFilter): Listing[] {
  return ALL_LISTINGS.filter((l) => {
    if (filter.submarket) {
      const wanted = canonicalSubmarket(filter.submarket).toLowerCase();
      if (l.submarket.toLowerCase() !== wanted) return false;
    }
    if (filter.sfMin != null && l.sf < filter.sfMin) return false;
    if (filter.sfMax != null && l.sf > filter.sfMax) return false;
    if (filter.subleaseOrDirect && filter.subleaseOrDirect !== "any") {
      if (l.type !== filter.subleaseOrDirect) return false;
    }
    if (filter.features?.length) {
      const have = new Set(l.features.map((f) => f.toLowerCase()));
      const allMatch = filter.features.every((want) =>
        // substring match so "fiber" matches "fiber internet"
        Array.from(have).some((h) => h.includes(want.toLowerCase()))
      );
      if (!allMatch) return false;
    }
    return true;
  });
}

export function getListingBySlug(slug: string): Listing | null {
  return ALL_LISTINGS.find((l) => l.slug === slug) ?? null;
}

export function getAdjacentListings(slug: string): {
  prev: Listing | null;
  next: Listing | null;
} {
  const idx = ALL_LISTINGS.findIndex((l) => l.slug === slug);
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? ALL_LISTINGS[idx - 1] : null,
    next: idx < ALL_LISTINGS.length - 1 ? ALL_LISTINGS[idx + 1] : null,
  };
}
