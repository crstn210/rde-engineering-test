import type { Metadata } from "next";
import Link from "next/link";
import SearchBox from "@/components/SearchBox";
import ListingCard from "@/components/ListingCard";
import { parseSearchQuery } from "@/lib/ai";
import { filterListings, ALL_LISTINGS } from "@/lib/listings";

type SearchPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export async function generateMetadata({
  searchParams,
}: SearchPageProps): Promise<Metadata> {
  const { q } = await searchParams;
  const title = q ? `${q}` : "Search";
  return {
    title,
    description: q
      ? `NYC office space matching "${q}" — curated by Beyond the Space.`
      : "Search NYC office listings.",
    robots: { index: false }, // query pages shouldn't dilute the index
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q = "" } = await searchParams;
  const query = q.trim();

  // Empty query: bounce back to the homepage experience inline.
  if (!query) {
    return (
      <main className="flex-1 mx-auto w-full max-w-4xl px-6 py-16 text-center">
        <h1 className="font-display text-3xl text-ink">
          Describe what you need.
        </h1>
        <div className="mt-8">
          <SearchBox autoFocus />
        </div>
      </main>
    );
  }

  const parsed = await parseSearchQuery(query);
  const results = filterListings(parsed.filter);

  // If the parse returned a submarket but it wiped results, gracefully
  // degrade: show all listings + keep the AI's reply + flag the miss.
  // This is the spec's "LLM returns no valid submarket" path.
  const degraded = parsed.filter.submarket && results.length === 0;
  const displayed = degraded ? ALL_LISTINGS : results;
  const degradedNote = degraded
    ? `No exact matches in ${parsed.filter.submarket} — here are our closest NYC options.`
    : null;

  return (
    <main className="flex-1 flex flex-col">
      <header className="border-b border-line">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="font-display text-xl tracking-tight text-ink"
          >
            Beyond<span className="italic text-accent"> the </span>Space
          </Link>
          <nav className="text-xs uppercase tracking-[0.18em] text-ink-muted tabular-nums">
            {ALL_LISTINGS.length} NYC listings
          </nav>
        </div>
      </header>

      <section className="mx-auto w-full max-w-6xl px-6 py-10">
        {/* AI response bubble */}
        <div className="flex gap-3">
          <div className="shrink-0 flex items-center justify-center h-9 w-9 rounded-full bg-accent text-bg text-sm font-display">
            BS
          </div>
          <div className="flex-1">
            <div className="inline-block rounded-2xl rounded-tl-sm bg-bg-card border border-line px-5 py-3.5 text-ink-soft max-w-2xl leading-relaxed">
              {parsed.reply}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-faint">
              <span className="uppercase tracking-wider">
                {parsed.source === "claude" ? "Claude Haiku" : "Keyword fallback"}
              </span>
              {parsed.warning && (
                <>
                  <span>·</span>
                  <span>{parsed.warning}</span>
                </>
              )}
              {degradedNote && (
                <>
                  <span>·</span>
                  <span>{degradedNote}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Query pill + count */}
        <div className="mt-8 flex items-end justify-between gap-4 border-b border-line pb-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-ink-muted">
              Your search
            </p>
            <p className="mt-1 font-display text-2xl text-ink">&ldquo;{query}&rdquo;</p>
          </div>
          <p className="text-sm text-ink-muted tabular-nums shrink-0">
            {displayed.length}{" "}
            {displayed.length === 1 ? "match" : "matches"}
          </p>
        </div>

        {/* Results grid */}
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {displayed.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>

        {displayed.length === 0 && (
          <div className="mt-10 rounded-2xl border border-line bg-bg-card p-8 text-center">
            <p className="font-display text-xl text-ink">No matches yet.</p>
            <p className="mt-2 text-ink-muted">
              Try a different neighborhood, size, or feature in the box below.
            </p>
          </div>
        )}

        {/* Refine */}
        <div className="mt-12 border-t border-line pt-8">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-muted mb-3">
            Refine your search
          </p>
          <SearchBox initialQuery={query} variant="refine" />
        </div>
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
