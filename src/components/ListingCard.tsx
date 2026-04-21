import Link from "next/link";
import type { Listing } from "@/lib/listings";

function formatSf(sf: number) {
  return sf.toLocaleString() + " SF";
}

function formatPrice(pricePerSf: number) {
  return `$${pricePerSf}/SF`;
}

function availabilityLabel(a: string) {
  if (a === "immediate") return "Available now";
  if (a === "30-days") return "~30 days";
  if (a === "60-days") return "~60 days";
  if (a === "90-days") return "~90 days";
  return a;
}

export default function ListingCard({ listing }: { listing: Listing }) {
  return (
    <Link
      href={`/listings/${listing.slug}`}
      className="group block overflow-hidden rounded-2xl border border-line bg-bg-card transition-all hover:border-accent hover:shadow-[0_8px_24px_-12px_rgba(194,65,12,0.25)]"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-bg-sunken">
        {/* SVG hero — use <img> directly since Next/Image has SVG quirks + we
            want zero layout shift for the Phase-1 demo. Real product would
            use next/image with blur placeholders. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={listing.heroImage}
          alt={`${listing.address} — ${listing.unit}`}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <div className="absolute left-3 top-3 flex gap-2">
          <span className="rounded-full bg-bg/90 px-2.5 py-0.5 text-[11px] uppercase tracking-wider text-ink-soft backdrop-blur">
            {listing.type}
          </span>
          {listing.condition === "move-in-ready" && (
            <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] uppercase tracking-wider text-bg">
              Move-in
            </span>
          )}
        </div>
      </div>
      <div className="px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-lg text-ink">
              {listing.address}
            </p>
            <p className="truncate text-sm text-ink-muted">
              {listing.unit} · {listing.submarket}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-medium text-ink tabular-nums">
              {formatSf(listing.sf)}
            </p>
            <p className="text-xs text-ink-muted tabular-nums">
              {formatPrice(listing.pricePerSf)}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {listing.features.slice(0, 3).map((f) => (
            <span
              key={f}
              className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-muted"
            >
              {f}
            </span>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-ink-muted">
          <span>Class {listing.buildingClass} · Built {listing.yearBuilt}</span>
          <span>{availabilityLabel(listing.availability)}</span>
        </div>
      </div>
    </Link>
  );
}
