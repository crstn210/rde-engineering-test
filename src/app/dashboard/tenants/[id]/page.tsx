import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantDetail } from "@/lib/dashboard";

export const metadata: Metadata = {
  title: "Tenant",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const fmt = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function TenantDetailPage({ params }: Props) {
  const { id } = await params;
  const detail = await getTenantDetail(id);
  if (!detail) notFound();

  const { tenant, leases, payments, charges, outstanding } = detail;

  return (
    <main className="flex-1 flex flex-col">
      <header className="border-b border-line">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-display text-xl tracking-tight text-ink">
            Beyond<span className="italic text-accent"> the </span>Space
          </Link>
          <Link
            href="/dashboard"
            className="text-xs uppercase tracking-[0.18em] text-ink-muted hover:text-accent"
          >
            ← Back to dashboard
          </Link>
        </div>
      </header>

      <section className="mx-auto w-full max-w-6xl px-6 py-10">
        <p className="text-xs uppercase tracking-[0.2em] text-ink-muted">
          Tenant
        </p>
        <h1 className="mt-2 font-display text-4xl sm:text-5xl text-ink leading-tight">
          {tenant.firstName} {tenant.lastName}
        </h1>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-muted">
          {tenant.email ? <span>{tenant.email}</span> : <span className="italic">no email on file</span>}
          {tenant.phone ? <span>{tenant.phone}</span> : <span className="italic">no phone on file</span>}
        </div>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Kpi label="Leases" value={leases.length.toString()} />
          <Kpi label="Lifetime charges" value={fmt(charges.reduce((s, c) => s + c.amount, 0))} />
          <Kpi
            label="Outstanding"
            value={fmt(outstanding)}
            tone={outstanding > 0 ? "accent" : "default"}
          />
        </div>

        <section className="mt-10">
          <h2 className="font-display text-2xl text-ink">Leases</h2>
          <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-line">
                <tr>
                  <Th>Lease</Th>
                  <Th>Property</Th>
                  <Th>Unit</Th>
                  <Th>Term</Th>
                  <Th right>Rent</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {leases.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-muted">
                      {l.externalId}
                    </td>
                    <td className="px-4 py-2.5 text-ink-soft">{l.property}</td>
                    <td className="px-4 py-2.5 text-ink-soft">{l.unit}</td>
                    <td className="px-4 py-2.5 text-ink-muted tabular-nums">
                      {l.startDate} → {l.endDate}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink">
                      {fmt(l.monthlyRent)}
                    </td>
                    <td className="px-4 py-2.5 text-ink-soft capitalize">
                      {l.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <section>
            <h2 className="font-display text-2xl text-ink">Payments</h2>
            <div className="mt-4 max-h-[480px] overflow-auto rounded-2xl border border-line bg-bg-card">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-bg-card border-b border-line">
                  <tr>
                    <Th>Date</Th>
                    <Th>Method</Th>
                    <Th right>Amount</Th>
                    <Th>Lease</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-2 tabular-nums text-ink-soft">{p.date}</td>
                      <td className="px-4 py-2 text-ink-soft capitalize">
                        {p.method ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-ink">
                        {fmt(p.amount)}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-ink-muted">
                        {p.leaseExternalId}
                      </td>
                    </tr>
                  ))}
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-ink-muted">
                        No payments recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="font-display text-2xl text-ink">Charges</h2>
            <div className="mt-4 max-h-[480px] overflow-auto rounded-2xl border border-line bg-bg-card">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-bg-card border-b border-line">
                  <tr>
                    <Th>Due</Th>
                    <Th>Category</Th>
                    <Th right>Amount</Th>
                    <Th>Lease</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {charges.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2 tabular-nums text-ink-soft">{c.date}</td>
                      <td className="px-4 py-2 text-ink-soft capitalize">
                        {c.category.replace(/_/g, " ")}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-ink">
                        {fmt(c.amount)}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-ink-muted">
                        {c.leaseExternalId}
                      </td>
                    </tr>
                  ))}
                  {charges.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-ink-muted">
                        No charges recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>

      <footer className="border-t border-line mt-auto">
        <div className="mx-auto max-w-6xl px-6 py-5 text-xs text-ink-muted flex justify-between">
          <span>Synthetic data · engineering demo for RDE Advisors</span>
          <span>&copy; {new Date().getFullYear()}</span>
        </div>
      </footer>
    </main>
  );
}

function Th({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: boolean;
}) {
  return (
    <th
      className={`px-4 py-2 font-medium text-ink-muted uppercase tracking-wider text-[11px] ${right ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
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
