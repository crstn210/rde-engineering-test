"use client";

import { useState } from "react";

const EXAMPLES = [
  "show me all tenants with past-due rent over $5,000",
  "vendors we paid more than $10,000 this year",
  "active leases ending in the next 60 days",
];

type ApiResult =
  | {
      ok: true;
      plan: { entity: string; filters: { field: string; op: string; value: unknown }[] };
      rows: Array<Record<string, unknown>>;
      source: "claude" | "fallback";
      narration: string;
    }
  | { ok: false; error: string; source: "claude" | "fallback"; narration: string };

const fmt = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function pickDisplayValue(v: unknown): string {
  if (v == null) return "—";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default function NLQueryBar() {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setLoading(true);
    setResult(null);
    try {
      const resp = await fetch("/api/nlquery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = (await resp.json()) as ApiResult;
      setResult(data);
    } catch (e) {
      setResult({
        ok: false,
        error: e instanceof Error ? e.message : "Network error",
        source: "fallback",
        narration: "",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-bg-card">
      <header className="flex items-center justify-between px-5 py-4 border-b border-line">
        <div>
          <h2 className="font-display text-xl text-ink">Ask the platform</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Plain English. We translate it to a safe query — no raw SQL
            reaches the database, no writes possible.
          </p>
        </div>
      </header>
      <div className="p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(q);
          }}
          className="relative"
        >
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. show me all tenants with past-due rent over $5,000"
            className="chat-input w-full rounded-xl border border-line bg-bg px-4 py-3 pr-24 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-colors"
          />
          <button
            type="submit"
            disabled={loading}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-ink px-4 py-2 text-xs font-medium tracking-wide text-bg hover:bg-accent transition-colors disabled:opacity-60"
          >
            {loading ? "…" : "Ask"}
          </button>
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setQ(ex);
                run(ex);
              }}
              className="rounded-full border border-line bg-bg px-3 py-1 text-xs text-ink-muted hover:border-accent hover:text-accent transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>

        {result && (
          <div className="mt-5">
            <div className="flex items-center gap-2 text-[11px] text-ink-faint">
              <span className="uppercase tracking-wider">
                {result.source === "claude" ? "Claude Haiku" : "Keyword fallback"}
              </span>
              {result.ok && (
                <>
                  <span>·</span>
                  <span>
                    {result.plan.entity} · {result.rows.length} rows ·{" "}
                    {result.plan.filters.length || 0} filter(s)
                  </span>
                </>
              )}
            </div>
            {result.narration && (
              <p className="mt-1 text-sm text-ink-soft">{result.narration}</p>
            )}

            {result.ok ? (
              <ResultTable entity={result.plan.entity} rows={result.rows} />
            ) : (
              <div className="mt-3 rounded-lg border border-accent/30 bg-accent-soft/50 px-4 py-3 text-sm text-ink-soft">
                <span className="font-medium text-accent-dark">
                  Couldn't run that query:
                </span>{" "}
                {result.error}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function ResultTable({
  entity,
  rows,
}: {
  entity: string;
  rows: Array<Record<string, unknown>>;
}) {
  if (!rows.length) {
    return (
      <p className="mt-4 rounded-lg border border-line bg-bg px-4 py-3 text-sm text-ink-muted">
        No rows matched.
      </p>
    );
  }
  // Pick columns to show per entity.
  const cols = getColumns(entity);
  return (
    <div className="mt-4 max-h-[340px] overflow-auto rounded-xl border border-line bg-bg">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-bg-card border-b border-line">
          <tr>
            {cols.map((c) => (
              <th
                key={c.key}
                className="py-2 px-3 text-left font-medium text-ink-muted uppercase tracking-wider text-[11px]"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-bg-sunken/40">
              {cols.map((c) => (
                <td key={c.key} className="px-3 py-2 text-ink-soft">
                  {c.format
                    ? c.format(c.get(r))
                    : pickDisplayValue(c.get(r))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Col = {
  key: string;
  label: string;
  get: (r: Record<string, unknown>) => unknown;
  format?: (v: unknown) => string;
};

function asRec(x: unknown): Record<string, unknown> | null {
  return x && typeof x === "object" ? (x as Record<string, unknown>) : null;
}

function getColumns(entity: string): Col[] {
  switch (entity) {
    case "lease":
      return [
        {
          key: "tenant",
          label: "Tenant",
          get: (r) => {
            const t = asRec(r.tenant);
            return t ? `${t.firstName} ${t.lastName}` : "—";
          },
        },
        {
          key: "unit",
          label: "Unit",
          get: (r) => {
            const u = asRec(r.unit);
            const p = u ? asRec(u.property) : null;
            return u ? `${p?.name ?? ""} · ${u.label}` : "—";
          },
        },
        {
          key: "monthlyRent",
          label: "Rent",
          get: (r) => r.monthlyRent,
          format: (v) => (typeof v === "number" ? fmt(v) : String(v)),
        },
        { key: "status", label: "Status", get: (r) => r.status },
        {
          key: "endDate",
          label: "Ends",
          get: (r) => (r.endDate instanceof Date ? r.endDate : r.endDate),
          format: (v) =>
            v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10),
        },
      ];
    case "charge":
      return [
        { key: "category", label: "Category", get: (r) => r.category },
        {
          key: "amount",
          label: "Amount",
          get: (r) => r.amount,
          format: (v) => (typeof v === "number" ? fmt(v) : String(v)),
        },
        {
          key: "dueDate",
          label: "Due",
          get: (r) => r.dueDate,
          format: (v) =>
            v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10),
        },
        {
          key: "lease",
          label: "Lease",
          get: (r) => {
            const l = asRec(r.lease);
            const t = l ? asRec(l.tenant) : null;
            return t ? `${t.firstName} ${t.lastName}` : l ? l.externalId : "—";
          },
        },
      ];
    case "payment":
      return [
        {
          key: "amount",
          label: "Amount",
          get: (r) => r.amount,
          format: (v) => (typeof v === "number" ? fmt(v) : String(v)),
        },
        { key: "method", label: "Method", get: (r) => r.method ?? "—" },
        {
          key: "paidDate",
          label: "Paid",
          get: (r) => r.paidDate,
          format: (v) =>
            v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10),
        },
        {
          key: "lease",
          label: "Lease",
          get: (r) => {
            const l = asRec(r.lease);
            const t = l ? asRec(l.tenant) : null;
            return t ? `${t.firstName} ${t.lastName}` : l ? l.externalId : "—";
          },
        },
      ];
    case "tenant":
      return [
        {
          key: "name",
          label: "Name",
          get: (r) => `${r.firstName ?? ""} ${r.lastName ?? ""}`,
        },
        { key: "email", label: "Email", get: (r) => r.email ?? "—" },
        { key: "phone", label: "Phone", get: (r) => r.phone ?? "—" },
      ];
    case "workOrder":
      return [
        {
          key: "vendor",
          label: "Vendor",
          get: (r) => r.vendor ?? "—",
        },
        { key: "category", label: "Category", get: (r) => r.category },
        {
          key: "cost",
          label: "Cost",
          get: (r) => r.cost,
          format: (v) => (typeof v === "number" ? fmt(v) : String(v ?? "—")),
        },
        {
          key: "unit",
          label: "Unit",
          get: (r) => {
            const u = asRec(r.unit);
            const p = u ? asRec(u.property) : null;
            return u ? `${p?.name ?? ""} · ${u.label}` : "—";
          },
        },
        {
          key: "openedDate",
          label: "Opened",
          get: (r) => r.openedDate,
          format: (v) =>
            v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10),
        },
      ];
  }
  return [];
}
