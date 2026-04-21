import Link from "next/link";
import type { AgingBuckets as Buckets, AgingTenantRow } from "@/lib/dashboard";

const fmt = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const BUCKET_LABEL: Record<AgingTenantRow["bucket"], string> = {
  current: "Current",
  d30: "31–60",
  d60: "61–90",
  d90: "91–120",
  d90plus: "120+",
};

const BUCKET_TONE: Record<AgingTenantRow["bucket"], string> = {
  current: "text-ink",
  d30: "text-ink",
  d60: "text-accent",
  d90: "text-accent",
  d90plus: "text-accent-dark",
};

export default function AgingBuckets({
  aging,
  rows,
}: {
  aging: Buckets;
  rows: AgingTenantRow[];
}) {
  const tiles: Array<{ k: string; v: number; label: string }> = [
    { k: "current", v: aging.current, label: "0–30" },
    { k: "d30", v: aging.d30, label: "31–60" },
    { k: "d60", v: aging.d60, label: "61–90" },
    { k: "d90", v: aging.d90, label: "91–120" },
    { k: "d90plus", v: aging.d90plus, label: "120+" },
  ];

  return (
    <section className="rounded-2xl border border-line bg-bg-card">
      <header className="flex items-center justify-between px-5 py-4 border-b border-line">
        <div>
          <h2 className="font-display text-xl text-ink">AR aging</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            {fmt(aging.totalOutstanding)} outstanding across {rows.length}{" "}
            {rows.length === 1 ? "tenant" : "tenants"}
          </p>
        </div>
      </header>
      <div className="grid grid-cols-5 gap-2 px-5 py-4">
        {tiles.map((t) => (
          <div
            key={t.k}
            className="rounded-xl border border-line bg-bg px-3 py-3 text-center"
          >
            <p className="text-[10px] uppercase tracking-wider text-ink-muted">
              {t.label} days
            </p>
            <p className="mt-1 font-display text-lg text-ink tabular-nums">
              {fmt(t.v)}
            </p>
          </div>
        ))}
      </div>
      <div className="border-t border-line max-h-[280px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-bg-card border-b border-line">
            <tr>
              <th className="py-2 px-5 text-left font-medium text-ink-muted uppercase tracking-wider text-[11px]">
                Tenant
              </th>
              <th className="py-2 px-3 text-left font-medium text-ink-muted uppercase tracking-wider text-[11px]">
                Unit
              </th>
              <th className="py-2 px-3 text-left font-medium text-ink-muted uppercase tracking-wider text-[11px]">
                Oldest
              </th>
              <th className="py-2 px-3 text-left font-medium text-ink-muted uppercase tracking-wider text-[11px]">
                Bucket
              </th>
              <th className="py-2 px-5 text-right font-medium text-ink-muted uppercase tracking-wider text-[11px]">
                Outstanding
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.slice(0, 50).map((r) => (
              <tr key={r.leaseId} className="hover:bg-bg-sunken/50">
                <td className="px-5 py-2.5">
                  <Link
                    href={`/dashboard/tenants/${r.tenantId}`}
                    className="text-ink hover:text-accent"
                  >
                    {r.tenantName}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-ink-soft">
                  {r.property} · {r.unit}
                </td>
                <td className="px-3 py-2.5 text-ink-muted tabular-nums">
                  {r.oldestDueDate}
                </td>
                <td className={`px-3 py-2.5 ${BUCKET_TONE[r.bucket]}`}>
                  {BUCKET_LABEL[r.bucket]}
                </td>
                <td className="px-5 py-2.5 text-right tabular-nums text-ink">
                  {fmt(r.outstanding)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="p-10 text-center text-ink-muted">
            All tenants are current. Nothing outstanding.
          </div>
        )}
      </div>
    </section>
  );
}
