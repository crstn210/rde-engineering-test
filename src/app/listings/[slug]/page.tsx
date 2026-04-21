import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getListingBySlug, getAdjacentListings, ALL_LISTINGS } from "@/lib/listings";
import ListingGallery from "@/components/ListingGallery";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return ALL_LISTINGS.map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const l = getListingBySlug(slug);
  if (!l) return { title: "Listing not found" };
  const title = `${l.address}, ${l.unit} — ${l.sf.toLocaleString()} SF in ${l.submarket}`;
  const description = `${l.sf.toLocaleString()} SF ${l.type} office at ${l.address} in ${l.submarket}. $${l.pricePerSf}/SF, ${l.condition.replace(/-/g, " ")}. ${l.features.slice(0, 3).join(", ")}.`;
  return {
    title,
    description,
    alternates: { canonical: `/listings/${l.slug}` },
    openGraph: {
      title,
      description,
      images: [l.heroImage],
      type: "website",
    },
  };
}

export default async function ListingDetail({ params }: Props) {
  const { slug } = await params;
  const listing = getListingBySlug(slug);
  if (!listing) notFound();

  const { prev, next } = getAdjacentListings(slug);
  const images = [listing.heroImage, ...listing.photos];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: `${listing.address}, ${listing.unit}`,
    description: listing.description,
    image: listing.heroImage,
    floorSize: {
      "@type": "QuantitativeValue",
      value: listing.sf,
      unitCode: "FTK",
    },
    address: {
      "@type": "PostalAddress",
      streetAddress: listing.address,
      addressLocality: "New York",
      addressRegion: "NY",
      addressCountry: "US",
    },
  };

  return (
    <main className="flex-1 flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="border-b border-line">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="font-display text-xl tracking-tight text-ink"
          >
            Beyond<span className="italic text-accent"> the </span>Space
          </Link>
          <Link
            href="/"
            className="text-xs uppercase tracking-[0.18em] text-ink-muted hover:text-accent"
          >
            ← Back to search
          </Link>
        </div>
      </header>

      <section className="mx-auto w-full max-w-6xl px-6 py-10">
        {/* Breadcrumb-ish */}
        <p className="text-xs uppercase tracking-[0.2em] text-ink-muted">
          {listing.submarket} · {listing.type}
        </p>

        <h1 className="mt-2 font-display text-4xl sm:text-5xl text-ink leading-tight tracking-tight">
          {listing.address}
          <span className="text-ink-muted"> · {listing.unit}</span>
        </h1>

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-soft">
          <span>
            <span className="font-medium text-ink tabular-nums">
              {listing.sf.toLocaleString()} SF
            </span>
            <span className="text-ink-muted"> · size</span>
          </span>
          <span>
            <span className="font-medium text-ink tabular-nums">
              ${listing.pricePerSf}/SF
            </span>
            <span className="text-ink-muted"> · asking rent</span>
          </span>
          <span>
            <span className="font-medium text-ink capitalize">
              {listing.condition.replace(/-/g, " ")}
            </span>
            <span className="text-ink-muted"> · condition</span>
          </span>
          <span>
            <span className="font-medium text-ink">
              Class {listing.buildingClass}
            </span>
            <span className="text-ink-muted"> · built {listing.yearBuilt}</span>
          </span>
        </div>

        {/* Gallery */}
        <div className="mt-8">
          <ListingGallery
            images={images}
            floorplan={listing.floorplan}
            alt={`${listing.address} ${listing.unit}`}
          />
        </div>

        {/* Main grid: description + sidebar */}
        <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_320px]">
          <div className="space-y-10">
            <section>
              <h2 className="font-display text-2xl text-ink">About this space</h2>
              <p className="mt-3 text-ink-soft leading-relaxed max-w-prose">
                {listing.description}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {listing.features.map((f) => (
                  <span
                    key={f}
                    className="rounded-full border border-line bg-bg-card px-3 py-1 text-sm text-ink-soft"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </section>

            <section>
              <h2 className="font-display text-2xl text-ink">
                Space &amp; Building
              </h2>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt className="text-ink-muted">Rentable area</dt>
                  <dd className="text-ink tabular-nums">
                    {listing.sf.toLocaleString()} SF
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Asking rent</dt>
                  <dd className="text-ink tabular-nums">
                    ${listing.pricePerSf}/SF · $
                    {(
                      (listing.pricePerSf * listing.sf) /
                      12
                    ).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    /mo
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Availability</dt>
                  <dd className="text-ink capitalize">
                    {listing.availability.replace(/-/g, " ")}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Type</dt>
                  <dd className="text-ink capitalize">{listing.type}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Building class</dt>
                  <dd className="text-ink">{listing.buildingClass}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Year built</dt>
                  <dd className="text-ink tabular-nums">{listing.yearBuilt}</dd>
                </div>
              </dl>
            </section>

            <section>
              <h2 className="font-display text-2xl text-ink">Floor plan</h2>
              <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-bg-card p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={listing.floorplan}
                  alt={`Floor plan for ${listing.address} ${listing.unit}`}
                  className="w-full"
                />
              </div>
            </section>

            <section>
              <h2 className="font-display text-2xl text-ink">Transit &amp; Commute</h2>
              {/* Synthetic data — Transit API integration is bonus. Labelled so it
                  doesn't read as "real" in a demo. */}
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-ink-faint">
                Synthetic — real Transit scores would plug in here
              </p>
              <dl className="mt-4 grid grid-cols-3 gap-4">
                {[
                  { label: "Transit score", value: "94 / 100" },
                  { label: "Walk score", value: "98 / 100" },
                  { label: "Nearest subway", value: "~4 min" },
                ].map((x) => (
                  <div
                    key={x.label}
                    className="rounded-xl border border-line bg-bg-card px-4 py-3"
                  >
                    <dt className="text-xs text-ink-muted">{x.label}</dt>
                    <dd className="mt-1 font-display text-lg text-ink">
                      {x.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>

          {/* Sidebar — contact CTA */}
          <aside className="lg:sticky lg:top-8 self-start">
            <div className="rounded-2xl border border-line bg-bg-card p-6 shadow-[0_1px_2px_rgba(26,26,24,0.04)]">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                Interested?
              </p>
              <p className="mt-1 font-display text-xl text-ink">
                Contact the broker
              </p>
              <form className="mt-5 space-y-3">
                <input
                  type="text"
                  placeholder="Your name"
                  className="w-full rounded-lg border border-line bg-bg px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                <input
                  type="email"
                  placeholder="Email"
                  className="w-full rounded-lg border border-line bg-bg px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                <textarea
                  placeholder={`Interested in ${listing.unit} at ${listing.address}. Looking for a tour.`}
                  rows={3}
                  className="w-full rounded-lg border border-line bg-bg px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                <button
                  type="button"
                  className="w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-bg hover:bg-accent transition-colors"
                >
                  Request tour
                </button>
                <p className="text-[11px] text-ink-faint text-center">
                  Demo form — submissions not stored
                </p>
              </form>
            </div>
          </aside>
        </div>

        {/* Prev / next */}
        <nav className="mt-16 flex items-center justify-between gap-4 border-t border-line pt-6">
          {prev ? (
            <Link
              href={`/listings/${prev.slug}`}
              className="group flex-1 min-w-0"
            >
              <p className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                ← Previous
              </p>
              <p className="mt-1 truncate font-display text-lg text-ink group-hover:text-accent">
                {prev.address}
              </p>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`/listings/${next.slug}`}
              className="group flex-1 min-w-0 text-right"
            >
              <p className="text-xs uppercase tracking-[0.18em] text-ink-muted">
                Next →
              </p>
              <p className="mt-1 truncate font-display text-lg text-ink group-hover:text-accent">
                {next.address}
              </p>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </section>

      <footer className="border-t border-line mt-8">
        <div className="mx-auto max-w-6xl px-6 py-5 text-xs text-ink-muted flex justify-between">
          <span>Synthetic data · engineering demo for RDE Advisors</span>
          <span>&copy; {new Date().getFullYear()}</span>
        </div>
      </footer>
    </main>
  );
}
