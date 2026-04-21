import type { Metadata } from "next";
import SearchBox from "@/components/SearchBox";
import { ALL_LISTINGS } from "@/lib/listings";

export const metadata: Metadata = {
  title: "Beyond the Space — NYC Office Search",
  description:
    "Chat-first NYC office search. Describe the space you want — Hudson Yards, 10,000 SF, sublease, phone booths — and get matched listings instantly.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Beyond the Space — NYC Office Search",
    description:
      "Describe your space. We match it. The fastest way to find NYC office space.",
    type: "website",
    url: "/",
  },
};

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://beyondthespace.example.com";

export default function Home() {
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Beyond the Space",
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <main className="flex-1 flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />

      <header className="border-b border-line">
        <div className="mx-auto max-w-6xl px-6 py-5 flex items-center justify-between">
          <a
            href="/"
            className="font-display text-xl tracking-tight text-ink"
          >
            Beyond<span className="italic text-accent"> the </span>Space
          </a>
          <nav className="text-xs uppercase tracking-[0.18em] text-ink-muted tabular-nums">
            {ALL_LISTINGS.length} NYC listings
          </nav>
        </div>
      </header>

      <section className="flex-1 flex items-center">
        <div className="mx-auto w-full max-w-4xl px-6 py-24 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-ink-muted mb-6">
            NYC office search · chat-first
          </p>

          <h1 className="font-display text-5xl sm:text-6xl text-ink leading-[1.05] tracking-tight">
            Describe your space.
            <br />
            <span className="italic text-accent">We'll find it.</span>
          </h1>

          <p className="mt-7 text-lg text-ink-soft max-w-xl mx-auto leading-relaxed">
            Tell us what you need in plain English — submarket, size, vibe —
            and skip the filter sidebar.
          </p>

          <div className="mt-12">
            <SearchBox autoFocus />
          </div>

          <p className="mt-10 text-xs uppercase tracking-[0.18em] text-ink-faint">
            Click an example above · or type anything
          </p>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-6 py-5 text-xs text-ink-muted flex justify-between">
          <span>Synthetic data · engineering demo for RDE Advisors</span>
          <span>&copy; {new Date().getFullYear()}</span>
        </div>
      </footer>
    </main>
  );
}
