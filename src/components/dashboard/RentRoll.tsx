"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { RentRollRow } from "@/lib/dashboard";

type SortKey = keyof Pick<
  RentRollRow,
  "tenantName" | "property" | "unit" | "monthlyRent" | "endDate" | "status" | "balance"
>;
type SortDir = "asc" | "desc";

const fmt = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function statusPill(s: string) {
  if (s === "late")
    return (
      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-accent-dark">
        Late
      </span>
    );
  if (s === "notice")
    return (
      <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-ink-muted">
        Notice
      </span>
    );
  return (
    <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-ink-muted">
      Current
    </span>
  );
}

function toCsv(rows: RentRollRow[]): string {
  const header = [
    "tenant",
    "property",
    "unit",
    "monthly_rent",
    "start_date",
    "end_date",
    "status",
    "balance",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        `"${r.tenantName.replace(/"/g, '""')}"`,
        `"${r.property.replace(/"/g, '""')}"`,
        `"${r.unit.replace(/"/g, '""')}"`,
        r.monthlyRent,
        r.startDate,
        r.endDate,
        r.status,
        r.balance,
      ].join(",")
    );
  }
  return lines.join("\n");
}

export default function RentRoll({ rows }: { rows: RentRollRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("endDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const x = a[sortKey];
      const y = b[sortKey];
      let c = 0;
      if (typeof x === "number" && typeof y === "number") c = x - y;
      else c = String(x).localeCompare(String(y));
      return sortDir === "asc" ? c : -c;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function setSort(k: SortKey) {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  }

  function exportCsv() {
    const csv = toCsv(sorted);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `rent-roll-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const SortHead = ({ k, label, align = "left" }: { k: SortKey; label: string; align?: "left" | "right" }) => (
    <th className={`py-2.5 px-3 font-medium text-ink-muted uppercase tracking-wider text-[11px] ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        onClick={() => setSort(k)}
        className={`inline-flex items-center gap-1 hover:text-accent transition-colors ${sortKey === k ? "text-ink" : ""}`}
      >
        {label}
        {sortKey === k && (
          <span className="text-[9px]">{sortDir === "asc" ? "▲" : "▼"}</span>
        )}
      </button>
    </th>
  );

  return (
    <section className="rounded-2xl border border-line bg-bg-card">
      <header className="flex items-center justify-between px-5 py-4 border-b border-line">
        <div>
          <h2 className="font-display text-xl text-ink">Rent roll</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            {rows.length} active {rows.length === 1 ? "lease" : "leases"}
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="rounded-lg border border-line bg-bg px-3 py-1.5 text-xs uppercase tracking-[0.15em] text-ink-soft hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
        >
          Export CSV
        </button>
      </header>
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-bg-card border-b border-line">
            <tr>
              <SortHead k="tenantName" label="Tenant" />
              <SortHead k="property" label="Property" />
              <SortHead k="unit" label="Unit" />
              <SortHead k="monthlyRent" label="Rent" align="right" />
              <SortHead k="endDate" label="Ends" />
              <SortHead k="status" label="Status" />
              <SortHead k="balance" label="Balance" align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sorted.map((r) => (
              <tr key={r.leaseId} className="hover:bg-bg-sunken/50">
                <td className="px-3 py-2.5">
                  <Link
                    href={`/dashboard/tenants/${r.tenantId}`}
                    className="text-ink hover:text-accent"
                  >
                    {r.tenantName}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-ink-soft">{r.property}</td>
                <td className="px-3 py-2.5 text-ink-soft">{r.unit}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink">{fmt(r.monthlyRent)}</td>
                <td className="px-3 py-2.5 text-ink-soft tabular-nums">{r.endDate}</td>
                <td className="px-3 py-2.5">{statusPill(r.status)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink">
                  {r.balance > 0 ? fmt(r.balance) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="p-10 text-center text-ink-muted">
            No active leases yet.
          </div>
        )}
      </div>
    </section>
  );
}
