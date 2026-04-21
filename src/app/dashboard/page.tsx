import type { Metadata } from "next";
import Link from "next/link";
import { getDashboardSnapshot } from "@/lib/dashboard";
import RentRoll from "@/components/dashboard/RentRoll";
import AgingBuckets from "@/components/dashboard/AgingBuckets";
import ExpenseChart from "@/components/dashboard/ExpenseChart";
import NLQueryBar from "@/components/dashboard/NLQueryBar";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Rent roll, AR aging, expenses, and natural-language queries for your portfolio.",
  robots: { index: false },
};

// Always fetch fresh — property managers want a true read, not a cache.
export const dynamic = "force-dynamic";

const fmt = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function DashboardPage() {
  const snap = await getDashboardSnapshot();

  return (
    <main className="flex-1 flex flex-col">
      <header className="border-b border-line">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-display text-xl tracking-tight text-ink">
            Beyond<span className="italic text-accent"> the </span>Space
          </Link>
          <nav className="flex gap-6 text-xs uppercase tracking-[0.18em] text-ink-muted">
            <Link href="/import" className="hover:text-accent">Import</Link>
            <Link href="/dashboard" className="text-accent">Dashboard</Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto w-full max-w-7xl px-6 py-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink-muted">
              Property Management · portfolio dashboard
            </p>
            <h1 className="mt-2 font-display text-4xl sm:text-5xl text-ink leading-tight">
              What needs your attention.
            </h1>
          </div>
          {snap.importReady && (
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-ink-muted">
                Active leases
              </p>
              <p className="font-display text-2xl text-ink tabular-nums">
                {snap.totals.activeLeases}
              </p>
            </div>
          )}
        </div>

        {!snap.importReady ? (
          <EmptyState />
        ) : (
          <>
            {/* Top KPI strip */}
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Kpi
                label="Monthly rent roll"
                value={fmt(snap.totals.totalMonthlyRent)}
              />
              <Kpi
                label="Outstanding AR"
                value={fmt(snap.totals.totalOutstanding)}
                tone={snap.totals.totalOutstanding > 0 ? "accent" : "default"}
              />
              <Kpi
                label="Late tenants"
                value={snap.rentRoll.filter((r) => r.status === "late").length.toString()}
              />
            </div>

            {/* NL query */}
            <div className="mt-8">
              <NLQueryBar />
            </div>

            {/* Grid: rent roll + aging */}
            <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <RentRoll rows={snap.rentRoll} />
              <AgingBuckets aging={snap.aging} rows={snap.agingByTenant} />
            </div>

            {/* Expense chart full-width */}
            <div className="mt-6">
              <ExpenseChart expenses={snap.expenses} />
            </div>
          </>
        )}
      </section>

      <footer className="border-t border-line mt-auto">
        <div className="mx-auto max-w-7xl px-6 py-5 text-xs text-ink-muted flex justify-between">
          <span>Synthetic data · engineering demo for RDE Advisors</span>
          <span>&copy; {new Date().getFullYear()}</span>
        </div>
      </footer>
    </main>
  );
}

function Kpi({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent";
}) {
  return (
    <div className="rounded-2xl border border-line bg-bg-card px-5 py-4">
      <p className="text-xs uppercase tracking-wider text-ink-muted">{label}</p>
      <p
        className={`mt-1 font-display text-2xl tabular-nums ${
          tone === "accent" ? "text-accent" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-12 rounded-2xl border border-dashed border-line bg-bg-card p-10 text-center">
      <p className="font-display text-2xl text-ink">Nothing to show yet.</p>
      <p className="mt-2 text-ink-muted max-w-md mx-auto">
        Run an import first — try the sample data on /import and the
        dashboard will populate immediately.
      </p>
      <Link
        href="/import"
        className="mt-6 inline-block rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-bg hover:bg-accent transition-colors"
      >
        Go to import →
      </Link>
    </div>
  );
}
