"use client";

import Link from "next/link";
import { useState, useCallback } from "react";

type PreviewReport = {
  counts: {
    tenants: number;
    units: number;
    leases: number;
    charges: number;
    payments: number;
    workOrders: number;
    properties: number;
  };
  propertyVariants: { canonical: string; variants: string[] }[];
  tenantAnomalies: {
    duplicateIds: { row: { tenantId: string; firstName: string; lastName: string }; reason: string }[];
    duplicateEmails: { row: { tenantId: string; email: string | null }; reason: string }[];
    malformedEmails: { row: { tenantId: string; email: string | null }; reason: string }[];
    missingEmail: number;
    missingPhone: number;
  };
  unitAnomalies: {
    negativeSqft: { row: { unitId: string; squareFeet: number | null }; reason: string }[];
    nullRent: number;
  };
  leaseAnomalies: {
    orphanTenant: { row: { leaseId: string; tenantId: string }; reason: string }[];
    orphanUnit: { row: { leaseId: string; unitId: string }; reason: string }[];
    endBeforeStart: { row: { leaseId: string }; reason: string }[];
    overlappingActive: { row: { leaseId: string; unitId: string }; reason: string }[];
    unparseableDates: { row: { leaseId: string }; reason: string }[];
  };
  chargeAnomalies: {
    orphanLease: { row: { chargeId: string; leaseId: string }; reason: string }[];
    negativeAmount: { row: { chargeId: string; amount: number }; reason: string }[];
    unparseableDate: { row: { chargeId: string }; reason: string }[];
  };
  paymentAnomalies: {
    orphanLease: { row: { paymentId: string; leaseId: string }; reason: string }[];
    zeroAmount: { row: { paymentId: string }; reason: string }[];
    splitPayments: { leaseId: string; date: string; count: number }[];
  };
  workOrderAnomalies: {
    openNoClosedDate: number;
    negativeCost: { row: { workOrderId: string; cost: number | null }; reason: string }[];
  };
  committable: {
    tenants: number;
    units: number;
    leases: number;
    charges: number;
    payments: number;
    workOrders: number;
  };
};

type Phase = "idle" | "previewing" | "preview" | "committing" | "done" | "error";

type CommitResult = {
  importRunId: string;
  counts: PreviewReport["counts"];
  skipped: { leases: number; charges: number; payments: number; workOrders: number };
};

export default function ImportPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [report, setReport] = useState<PreviewReport | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runPreview = useCallback(async (f: File, label: string) => {
    setFile(f);
    setFileName(label);
    setError(null);
    setReport(null);
    setPhase("previewing");
    try {
      const fd = new FormData();
      fd.append("file", f);
      const resp = await fetch("/api/import/preview", { method: "POST", body: fd });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Preview failed");
      setReport(data.report);
      setPhase("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
      setPhase("error");
    }
  }, []);

  const useSample = useCallback(async () => {
    setError(null);
    setPhase("previewing");
    try {
      const resp = await fetch("/sample/buildium_export.zip");
      if (!resp.ok) throw new Error("Couldn't load sample zip");
      const blob = await resp.blob();
      const sampleFile = new File([blob], "buildium_export.zip", {
        type: "application/zip",
      });
      await runPreview(sampleFile, "Sample Buildium export");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sample");
      setPhase("error");
    }
  }, [runPreview]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files?.[0];
      if (f) runPreview(f, f.name);
    },
    [runPreview]
  );

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) runPreview(f, f.name);
    },
    [runPreview]
  );

  const commit = useCallback(async () => {
    if (!file) return;
    setPhase("committing");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await fetch("/api/import/commit", { method: "POST", body: fd });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Commit failed");
      setCommitResult(data);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Commit failed");
      setPhase("error");
    }
  }, [file]);

  const reset = useCallback(() => {
    setPhase("idle");
    setFile(null);
    setFileName("");
    setReport(null);
    setCommitResult(null);
    setError(null);
  }, []);

  return (
    <main className="flex-1 flex flex-col">
      <header className="border-b border-line">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-display text-xl tracking-tight text-ink">
            Beyond<span className="italic text-accent"> the </span>Space
          </Link>
          <nav className="flex gap-6 text-xs uppercase tracking-[0.18em] text-ink-muted">
            <Link href="/import" className="text-accent">Import</Link>
            <Link href="/dashboard" className="hover:text-accent">Dashboard</Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto w-full max-w-5xl px-6 py-12">
        <p className="text-xs uppercase tracking-[0.2em] text-ink-muted">
          Property Management · one-button import
        </p>
        <h1 className="mt-2 font-display text-4xl sm:text-5xl text-ink leading-tight">
          Move your portfolio over in a minute.
        </h1>
        <p className="mt-4 max-w-2xl text-ink-soft leading-relaxed">
          Drop a Buildium export (zip of tenants / units / leases / charges /
          payments / work orders). We'll show you exactly what will import,
          including duplicates, orphan rows, and parse failures, before
          anything touches your database.
        </p>
        <p className="mt-3 text-xs text-ink-muted italic">
          Appfolio and Yardi exports are phase 2 — same preview flow, different
          CSV shapes. Buildium ships first because it's 62% of the inbound
          migration requests we've seen.
        </p>

        {phase === "idle" && (
          <IdleView onDrop={onDrop} onPick={onPick} useSample={useSample} />
        )}

        {phase === "previewing" && <LoadingView label="Analyzing your export…" />}

        {phase === "preview" && report && (
          <PreviewView
            report={report}
            fileName={fileName}
            onCommit={commit}
            onCancel={reset}
          />
        )}

        {phase === "committing" && (
          <LoadingView label="Writing to the database…" />
        )}

        {phase === "done" && commitResult && (
          <DoneView result={commitResult} onReset={reset} />
        )}

        {phase === "error" && (
          <div className="mt-10 rounded-2xl border border-accent/30 bg-accent-soft px-6 py-5">
            <p className="font-display text-lg text-accent-dark">Something went wrong</p>
            <p className="mt-2 text-sm text-ink-soft">{error}</p>
            <button
              type="button"
              onClick={reset}
              className="mt-4 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bg hover:bg-accent transition-colors"
            >
              Start over
            </button>
          </div>
        )}
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

// ---- Subviews -------------------------------------------------------

function IdleView({
  onDrop,
  onPick,
  useSample,
}: {
  onDrop: (e: React.DragEvent) => void;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  useSample: () => void;
}) {
  return (
    <div className="mt-10 grid gap-4 md:grid-cols-[1fr_auto_1fr] items-stretch">
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="group flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-line bg-bg-card px-8 py-12 text-center cursor-pointer hover:border-accent hover:bg-accent-soft/50 transition-colors"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-sunken text-xl">
          ↑
        </div>
        <p className="font-display text-lg text-ink">Drop your export here</p>
        <p className="text-sm text-ink-muted max-w-xs">
          Zip file containing tenants.csv, units.csv, leases.csv, charges.csv,
          payments.csv, work_orders.csv.
        </p>
        <input
          type="file"
          accept=".zip,application/zip"
          onChange={onPick}
          className="hidden"
        />
        <span className="mt-2 text-xs uppercase tracking-[0.18em] text-ink-muted">
          Click or drop
        </span>
      </label>

      <div className="flex md:flex-col items-center justify-center gap-3 text-ink-faint">
        <div className="h-px flex-1 bg-line md:w-px md:h-full" />
        <span className="text-xs uppercase tracking-[0.18em]">or</span>
        <div className="h-px flex-1 bg-line md:w-px md:h-full" />
      </div>

      <button
        type="button"
        onClick={useSample}
        className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-bg-card px-8 py-12 text-center hover:border-accent hover:bg-accent-soft/50 transition-colors"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-sunken text-xl">
          ◎
        </div>
        <p className="font-display text-lg text-ink">Try with sample data</p>
        <p className="text-sm text-ink-muted max-w-xs">
          Synthetic Buildium export with deliberate messiness — orphan rows,
          duplicates, mixed date formats. Great for a tour.
        </p>
        <span className="mt-2 text-xs uppercase tracking-[0.18em] text-accent">
          Use sample →
        </span>
      </button>
    </div>
  );
}

function LoadingView({ label }: { label: string }) {
  return (
    <div className="mt-14 flex items-center gap-3 text-ink-soft">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      <span>{label}</span>
    </div>
  );
}

function PreviewView({
  report,
  fileName,
  onCommit,
  onCancel,
}: {
  report: PreviewReport;
  fileName: string;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const totalAnomalies =
    report.tenantAnomalies.duplicateIds.length +
    report.tenantAnomalies.duplicateEmails.length +
    report.tenantAnomalies.malformedEmails.length +
    report.unitAnomalies.negativeSqft.length +
    report.leaseAnomalies.orphanTenant.length +
    report.leaseAnomalies.orphanUnit.length +
    report.leaseAnomalies.endBeforeStart.length +
    report.leaseAnomalies.overlappingActive.length +
    report.leaseAnomalies.unparseableDates.length +
    report.chargeAnomalies.orphanLease.length +
    report.chargeAnomalies.negativeAmount.length +
    report.paymentAnomalies.orphanLease.length +
    report.paymentAnomalies.zeroAmount.length +
    report.paymentAnomalies.splitPayments.length +
    report.workOrderAnomalies.negativeCost.length;

  return (
    <div className="mt-10 space-y-8">
      <div className="flex items-end justify-between gap-4 border-b border-line pb-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-ink-muted">
            Preview
          </p>
          <p className="mt-1 font-display text-2xl text-ink">{fileName}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-muted">
            {totalAnomalies > 0 ? "Flagged rows" : "All clean"}
          </p>
          <p className="font-display text-3xl text-accent tabular-nums">
            {totalAnomalies}
          </p>
        </div>
      </div>

      {/* Counts grid */}
      <section>
        <h2 className="font-display text-xl text-ink">What you're importing</h2>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Properties", value: report.counts.properties, committable: report.counts.properties },
            { label: "Tenants", value: report.counts.tenants, committable: report.committable.tenants },
            { label: "Units", value: report.counts.units, committable: report.committable.units },
            { label: "Leases", value: report.counts.leases, committable: report.committable.leases },
            { label: "Charges", value: report.counts.charges, committable: report.committable.charges },
            { label: "Payments", value: report.counts.payments, committable: report.committable.payments },
            { label: "Work orders", value: report.counts.workOrders, committable: report.committable.workOrders },
          ].map((x) => (
            <div
              key={x.label}
              className="rounded-xl border border-line bg-bg-card px-4 py-3"
            >
              <p className="text-xs uppercase tracking-wider text-ink-muted">{x.label}</p>
              <p className="mt-1 font-display text-2xl text-ink tabular-nums">
                {x.committable}
                {x.committable !== x.value && (
                  <span className="text-base text-ink-faint">
                    {" / "}
                    {x.value}
                  </span>
                )}
              </p>
              {x.committable !== x.value && (
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  {x.value - x.committable} skipped
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Property variants */}
      {report.propertyVariants.length > 0 && (
        <AnomalySection
          title="Property name variants (merged)"
          subtitle="The same building appears under multiple spellings. We canonicalize them into one Property record."
          tone="info"
        >
          <ul className="divide-y divide-line">
            {report.propertyVariants.map((v) => (
              <li key={v.canonical} className="py-2 flex items-baseline gap-3">
                <span className="font-mono text-sm text-ink">{v.canonical}</span>
                <span className="text-xs text-ink-muted">
                  ← {v.variants.map((s) => `"${s}"`).join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </AnomalySection>
      )}

      {/* Tenants */}
      {(report.tenantAnomalies.duplicateEmails.length ||
        report.tenantAnomalies.malformedEmails.length ||
        report.tenantAnomalies.missingEmail ||
        report.tenantAnomalies.missingPhone) > 0 && (
        <AnomalySection title="Tenant anomalies">
          <KVList
            items={[
              report.tenantAnomalies.duplicateEmails.length && {
                k: "Duplicate emails",
                v: `${report.tenantAnomalies.duplicateEmails.length} rows — e.g. ${report.tenantAnomalies.duplicateEmails.slice(0, 3).map((a) => a.row.email).join(", ")}`,
              },
              report.tenantAnomalies.malformedEmails.length && {
                k: "Malformed emails",
                v: `${report.tenantAnomalies.malformedEmails.length} rows — will import but flag on dashboard`,
              },
              report.tenantAnomalies.missingEmail && {
                k: "Missing email",
                v: `${report.tenantAnomalies.missingEmail} rows — permitted, will import`,
              },
              report.tenantAnomalies.missingPhone && {
                k: "Missing phone",
                v: `${report.tenantAnomalies.missingPhone} rows — permitted, will import`,
              },
            ].filter(Boolean) as { k: string; v: string }[]}
          />
        </AnomalySection>
      )}

      {/* Units */}
      {(report.unitAnomalies.negativeSqft.length + report.unitAnomalies.nullRent) > 0 && (
        <AnomalySection title="Unit anomalies">
          <KVList
            items={[
              report.unitAnomalies.negativeSqft.length && {
                k: "Negative square footage",
                v: `${report.unitAnomalies.negativeSqft.length} rows — imported but flagged; review before rent roll.`,
              },
              report.unitAnomalies.nullRent && {
                k: "Null target rent",
                v: `${report.unitAnomalies.nullRent} rows — imported, rent must be set before billing.`,
              },
            ].filter(Boolean) as { k: string; v: string }[]}
          />
        </AnomalySection>
      )}

      {/* Leases */}
      {(report.leaseAnomalies.orphanTenant.length +
        report.leaseAnomalies.orphanUnit.length +
        report.leaseAnomalies.endBeforeStart.length +
        report.leaseAnomalies.overlappingActive.length +
        report.leaseAnomalies.unparseableDates.length) > 0 && (
        <AnomalySection title="Lease anomalies" tone="warn">
          <KVList
            items={[
              report.leaseAnomalies.orphanTenant.length && {
                k: "Orphan tenant_id",
                v: `${report.leaseAnomalies.orphanTenant.length} leases reference tenants not in the export — SKIPPED.`,
              },
              report.leaseAnomalies.orphanUnit.length && {
                k: "Orphan unit_id",
                v: `${report.leaseAnomalies.orphanUnit.length} leases reference units not in the export — SKIPPED.`,
              },
              report.leaseAnomalies.endBeforeStart.length && {
                k: "End date before start date",
                v: `${report.leaseAnomalies.endBeforeStart.length} leases — imported (probably data entry error, review on dashboard).`,
              },
              report.leaseAnomalies.overlappingActive.length && {
                k: "Overlapping active leases",
                v: `${report.leaseAnomalies.overlappingActive.length} leases overlap on the same unit — imported, needs human decision.`,
              },
              report.leaseAnomalies.unparseableDates.length && {
                k: "Unparseable dates",
                v: `${report.leaseAnomalies.unparseableDates.length} — SKIPPED.`,
              },
            ].filter(Boolean) as { k: string; v: string }[]}
          />
        </AnomalySection>
      )}

      {/* Charges / Payments */}
      {(report.chargeAnomalies.orphanLease.length +
        report.chargeAnomalies.negativeAmount.length +
        report.paymentAnomalies.orphanLease.length +
        report.paymentAnomalies.zeroAmount.length +
        report.paymentAnomalies.splitPayments.length) > 0 && (
        <AnomalySection title="Ledger anomalies">
          <KVList
            items={[
              report.chargeAnomalies.orphanLease.length && {
                k: "Orphan charges",
                v: `${report.chargeAnomalies.orphanLease.length} charges reference deleted leases — SKIPPED.`,
              },
              report.chargeAnomalies.negativeAmount.length && {
                k: "Negative charges",
                v: `${report.chargeAnomalies.negativeAmount.length} rows — imported (legitimate refunds / credits).`,
              },
              report.paymentAnomalies.orphanLease.length && {
                k: "Orphan payments",
                v: `${report.paymentAnomalies.orphanLease.length} — SKIPPED.`,
              },
              report.paymentAnomalies.zeroAmount.length && {
                k: "Zero-amount payments",
                v: `${report.paymentAnomalies.zeroAmount.length} — imported but flagged.`,
              },
              report.paymentAnomalies.splitPayments.length && {
                k: "Split payments",
                v: `${report.paymentAnomalies.splitPayments.length} lease-date pairs with >1 row — imported as-is; partial pay is valid.`,
              },
            ].filter(Boolean) as { k: string; v: string }[]}
          />
        </AnomalySection>
      )}

      {/* Work orders */}
      {(report.workOrderAnomalies.openNoClosedDate +
        report.workOrderAnomalies.negativeCost.length) > 0 && (
        <AnomalySection title="Work order anomalies">
          <KVList
            items={[
              report.workOrderAnomalies.openNoClosedDate && {
                k: "Open w/o closed_date",
                v: `${report.workOrderAnomalies.openNoClosedDate} — expected, these are ongoing.`,
              },
              report.workOrderAnomalies.negativeCost.length && {
                k: "Negative cost",
                v: `${report.workOrderAnomalies.negativeCost.length} — probably credits, review on dashboard.`,
              },
            ].filter(Boolean) as { k: string; v: string }[]}
          />
        </AnomalySection>
      )}

      {/* Commit CTA */}
      <div className="border-t border-line pt-6 flex items-center justify-between gap-4">
        <p className="text-sm text-ink-muted max-w-xl">
          Re-running this same import will never double-write —
          each row is keyed on its source system ID.
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-line bg-bg-card px-4 py-2.5 text-sm text-ink-soft hover:border-ink-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onCommit}
            className="rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-bg hover:bg-accent transition-colors"
          >
            Commit import →
          </button>
        </div>
      </div>
    </div>
  );
}

function AnomalySection({
  title,
  subtitle,
  tone = "default",
  children,
}: {
  title: string;
  subtitle?: string;
  tone?: "default" | "warn" | "info";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "warn"
      ? "border-accent/30 bg-accent-soft/40"
      : tone === "info"
        ? "border-line bg-bg-card"
        : "border-line bg-bg-card";
  return (
    <section className={`rounded-2xl border ${toneClass} p-5`}>
      <h3 className="font-display text-lg text-ink">{title}</h3>
      {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function KVList({ items }: { items: { k: string; v: string }[] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((x) => (
        <li key={x.k} className="py-2 grid grid-cols-[180px_1fr] gap-4 items-baseline">
          <span className="text-sm text-ink-muted">{x.k}</span>
          <span className="text-sm text-ink-soft">{x.v}</span>
        </li>
      ))}
    </ul>
  );
}

function DoneView({
  result,
  onReset,
}: {
  result: CommitResult;
  onReset: () => void;
}) {
  return (
    <div className="mt-12 rounded-2xl border border-line bg-bg-card p-8 text-center">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent text-bg text-lg font-medium">
        ✓
      </div>
      <h2 className="mt-4 font-display text-3xl text-ink">Import committed</h2>
      <p className="mt-2 text-sm text-ink-muted">
        Run id <span className="font-mono text-ink">{result.importRunId}</span>
      </p>

      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(
          [
            ["Tenants", result.counts.tenants],
            ["Units", result.counts.units],
            ["Leases", result.counts.leases],
            ["Charges", result.counts.charges],
            ["Payments", result.counts.payments],
            ["Work orders", result.counts.workOrders],
            ["Properties", result.counts.properties],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line bg-bg px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-ink-muted">{k}</p>
            <p className="mt-1 font-display text-2xl text-ink tabular-nums">{v}</p>
          </div>
        ))}
      </div>

      {(result.skipped.leases +
        result.skipped.charges +
        result.skipped.payments +
        result.skipped.workOrders) > 0 && (
        <p className="mt-5 text-sm text-ink-muted">
          Skipped on commit: {result.skipped.leases} leases,{" "}
          {result.skipped.charges} charges, {result.skipped.payments} payments,{" "}
          {result.skipped.workOrders} work orders (orphans or unparseable dates).
        </p>
      )}

      <div className="mt-8 flex justify-center gap-3">
        <Link
          href="/dashboard"
          className="rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-bg hover:bg-accent transition-colors"
        >
          Open dashboard →
        </Link>
        <button
          type="button"
          onClick={onReset}
          className="rounded-lg border border-line bg-bg-card px-4 py-2.5 text-sm text-ink-soft hover:border-ink-muted transition-colors"
        >
          Import another
        </button>
      </div>
    </div>
  );
}
