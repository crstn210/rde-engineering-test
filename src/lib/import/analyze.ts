// Analyze a parsed Buildium bundle and produce a preview report that
// surfaces every anomaly — duplicates, orphans, bad dates, negative
// numbers, property-name variants, overlapping leases — rather than
// silently dropping them. The UI renders this so a property manager
// can decide whether to commit.
//
// See SUBMISSION.md "Edge cases" paragraph for the 2+ edges we chose
// to spotlight.

import {
  ParsedBundle,
  TenantRow,
  UnitRow,
  LeaseRow,
  ChargeRow,
  PaymentRow,
  WorkOrderRow,
  isValidEmail,
} from "./parse";

export type AnomalyRow<T> = { row: T; reason: string };

export type PreviewReport = {
  counts: {
    tenants: number;
    units: number;
    leases: number;
    charges: number;
    payments: number;
    workOrders: number;
    properties: number;
  };
  propertyVariants: {
    canonical: string;
    variants: string[];
  }[];
  tenantAnomalies: {
    duplicateIds: AnomalyRow<TenantRow>[];
    duplicateEmails: AnomalyRow<TenantRow>[];
    malformedEmails: AnomalyRow<TenantRow>[];
    missingEmail: number;
    missingPhone: number;
    unparseableDob: AnomalyRow<TenantRow>[];
  };
  unitAnomalies: {
    duplicateIds: AnomalyRow<UnitRow>[];
    negativeSqft: AnomalyRow<UnitRow>[];
    nullRent: number;
  };
  leaseAnomalies: {
    duplicateIds: AnomalyRow<LeaseRow>[];
    orphanTenant: AnomalyRow<LeaseRow>[];
    orphanUnit: AnomalyRow<LeaseRow>[];
    endBeforeStart: AnomalyRow<LeaseRow>[];
    overlappingActive: AnomalyRow<LeaseRow>[];
    unparseableDates: AnomalyRow<LeaseRow>[];
  };
  chargeAnomalies: {
    orphanLease: AnomalyRow<ChargeRow>[];
    negativeAmount: AnomalyRow<ChargeRow>[];
    unparseableDate: AnomalyRow<ChargeRow>[];
  };
  paymentAnomalies: {
    orphanLease: AnomalyRow<PaymentRow>[];
    zeroAmount: AnomalyRow<PaymentRow>[];
    splitPayments: { leaseId: string; date: string; count: number }[];
    unparseableDate: AnomalyRow<PaymentRow>[];
  };
  workOrderAnomalies: {
    openNoClosedDate: number;
    negativeCost: AnomalyRow<WorkOrderRow>[];
    unparseableDate: AnomalyRow<WorkOrderRow>[];
  };
  // Rows we WILL import (post-filter) — counts that survive.
  committable: {
    tenants: number;
    units: number;
    leases: number;
    charges: number;
    payments: number;
    workOrders: number;
  };
};

function dateKey(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export function analyzeBundle(bundle: ParsedBundle): PreviewReport {
  // ---- Property name canonicalization ----
  const variantMap = new Map<string, Set<string>>();
  for (const u of bundle.units) {
    const s = variantMap.get(u.propertyNameCanonical) ?? new Set();
    s.add(u.propertyName);
    variantMap.set(u.propertyNameCanonical, s);
  }
  const propertyVariants = Array.from(variantMap.entries())
    .filter(([, s]) => s.size > 1)
    .map(([canonical, s]) => ({ canonical, variants: Array.from(s) }));

  // ---- Tenants ----
  const tenantSeenIds = new Map<string, number>();
  const tenantSeenEmails = new Map<string, number>();
  const duplicateTenantIds: AnomalyRow<TenantRow>[] = [];
  const duplicateTenantEmails: AnomalyRow<TenantRow>[] = [];
  const malformedTenantEmails: AnomalyRow<TenantRow>[] = [];
  const unparseableDob: AnomalyRow<TenantRow>[] = [];
  let missingEmail = 0;
  let missingPhone = 0;

  for (const t of bundle.tenants) {
    const idCount = (tenantSeenIds.get(t.tenantId) ?? 0) + 1;
    tenantSeenIds.set(t.tenantId, idCount);
    if (idCount > 1) duplicateTenantIds.push({ row: t, reason: "duplicate tenant_id" });

    if (!t.email) {
      missingEmail++;
    } else {
      if (!isValidEmail(t.email)) {
        malformedTenantEmails.push({ row: t, reason: "malformed email" });
      } else {
        const key = t.email.toLowerCase();
        const emailCount = (tenantSeenEmails.get(key) ?? 0) + 1;
        tenantSeenEmails.set(key, emailCount);
        if (emailCount > 1) {
          duplicateTenantEmails.push({ row: t, reason: "duplicate email" });
        }
      }
    }

    if (!t.phone) missingPhone++;
    // DOB parse failure — raw non-empty string that returned null
    // (we can't access raw here; flag tenants where DOB is null but status is active)
    if (t.dateOfBirth === null) unparseableDob.push({ row: t, reason: "missing or unparseable DOB" });
  }

  // ---- Units ----
  const unitSeenIds = new Map<string, number>();
  const duplicateUnitIds: AnomalyRow<UnitRow>[] = [];
  const negativeSqft: AnomalyRow<UnitRow>[] = [];
  let nullRent = 0;

  for (const u of bundle.units) {
    const idCount = (unitSeenIds.get(u.unitId) ?? 0) + 1;
    unitSeenIds.set(u.unitId, idCount);
    if (idCount > 1) duplicateUnitIds.push({ row: u, reason: "duplicate unit_id" });
    if (u.squareFeet !== null && u.squareFeet < 0) {
      negativeSqft.push({ row: u, reason: `negative sqft: ${u.squareFeet}` });
    }
    if (u.monthlyRentTarget === null) nullRent++;
  }

  const validTenantIds = new Set(bundle.tenants.map((t) => t.tenantId));
  const validUnitIds = new Set(bundle.units.map((u) => u.unitId));

  // ---- Leases ----
  const leaseSeenIds = new Map<string, number>();
  const duplicateLeaseIds: AnomalyRow<LeaseRow>[] = [];
  const orphanLeaseTenant: AnomalyRow<LeaseRow>[] = [];
  const orphanLeaseUnit: AnomalyRow<LeaseRow>[] = [];
  const endBeforeStart: AnomalyRow<LeaseRow>[] = [];
  const unparseableLeaseDates: AnomalyRow<LeaseRow>[] = [];

  for (const l of bundle.leases) {
    const idCount = (leaseSeenIds.get(l.leaseId) ?? 0) + 1;
    leaseSeenIds.set(l.leaseId, idCount);
    if (idCount > 1) duplicateLeaseIds.push({ row: l, reason: "duplicate lease_id" });

    if (!validTenantIds.has(l.tenantId)) {
      orphanLeaseTenant.push({ row: l, reason: `tenant_id ${l.tenantId} not in tenants.csv` });
    }
    if (!validUnitIds.has(l.unitId)) {
      orphanLeaseUnit.push({ row: l, reason: `unit_id ${l.unitId} not in units.csv` });
    }
    if (l.startDate === null || l.endDate === null) {
      unparseableLeaseDates.push({ row: l, reason: "unparseable start or end date" });
    } else if (l.endDate.getTime() < l.startDate.getTime()) {
      endBeforeStart.push({ row: l, reason: "end_date before start_date" });
    }
  }

  // Overlapping active leases on the same unit
  const activeLeasesPerUnit = new Map<string, LeaseRow[]>();
  for (const l of bundle.leases) {
    if (
      l.status !== "active" ||
      l.startDate === null ||
      l.endDate === null
    )
      continue;
    const arr = activeLeasesPerUnit.get(l.unitId) ?? [];
    arr.push(l);
    activeLeasesPerUnit.set(l.unitId, arr);
  }
  const overlappingActive: AnomalyRow<LeaseRow>[] = [];
  for (const [, leases] of activeLeasesPerUnit) {
    if (leases.length < 2) continue;
    leases.sort((a, b) => (a.startDate!.getTime() - b.startDate!.getTime()));
    for (let i = 1; i < leases.length; i++) {
      const prev = leases[i - 1];
      const cur = leases[i];
      if (cur.startDate!.getTime() <= prev.endDate!.getTime()) {
        overlappingActive.push({
          row: cur,
          reason: `overlaps with ${prev.leaseId} on unit ${cur.unitId}`,
        });
      }
    }
  }

  const validLeaseIds = new Set(bundle.leases.map((l) => l.leaseId));

  // ---- Charges ----
  const orphanChargeLease: AnomalyRow<ChargeRow>[] = [];
  const negativeCharge: AnomalyRow<ChargeRow>[] = [];
  const unparseableChargeDate: AnomalyRow<ChargeRow>[] = [];
  for (const c of bundle.charges) {
    if (!validLeaseIds.has(c.leaseId)) {
      orphanChargeLease.push({ row: c, reason: `lease_id ${c.leaseId} missing` });
    }
    if (c.amount < 0) negativeCharge.push({ row: c, reason: `negative amount ${c.amount}` });
    if (c.chargeDate === null) unparseableChargeDate.push({ row: c, reason: "unparseable date" });
  }

  // ---- Payments ----
  const orphanPaymentLease: AnomalyRow<PaymentRow>[] = [];
  const zeroPayments: AnomalyRow<PaymentRow>[] = [];
  const splitSeen = new Map<string, number>();
  const unparseablePayDate: AnomalyRow<PaymentRow>[] = [];
  for (const p of bundle.payments) {
    if (!validLeaseIds.has(p.leaseId)) {
      orphanPaymentLease.push({ row: p, reason: `lease_id ${p.leaseId} missing` });
    }
    if (p.amount === 0) zeroPayments.push({ row: p, reason: "zero-amount payment" });
    if (p.paymentDate === null) {
      unparseablePayDate.push({ row: p, reason: "unparseable date" });
    } else {
      const key = `${p.leaseId}|${dateKey(p.paymentDate)}`;
      splitSeen.set(key, (splitSeen.get(key) ?? 0) + 1);
    }
  }
  const splitPayments = Array.from(splitSeen.entries())
    .filter(([, n]) => n > 1)
    .map(([k, n]) => {
      const [leaseId, date] = k.split("|");
      return { leaseId, date, count: n };
    });

  // ---- Work orders ----
  let openNoClosedDate = 0;
  const negativeCost: AnomalyRow<WorkOrderRow>[] = [];
  const unparseableWoDate: AnomalyRow<WorkOrderRow>[] = [];
  for (const w of bundle.workOrders) {
    if (w.status === "open" && w.closedDate === null) openNoClosedDate++;
    if (w.cost !== null && w.cost < 0) negativeCost.push({ row: w, reason: `negative cost ${w.cost}` });
    if (w.openedDate === null) unparseableWoDate.push({ row: w, reason: "unparseable opened_date" });
  }

  // ---- Committable counts (what survives the filter) ----
  // Rules (see commit.ts for enforcement):
  //   - skip duplicate IDs beyond the first occurrence
  //   - skip leases with orphan tenant/unit or unparseable dates
  //   - skip charges/payments with orphan lease
  //   - negative sqft units still import (flagged, but the row exists)
  //   - negative charge amounts still import (legitimate refunds — flag only)
  const uniqueTenantIds = new Set(bundle.tenants.map((t) => t.tenantId));
  const uniqueUnitIds = new Set(bundle.units.map((u) => u.unitId));
  const orphanLeaseIds = new Set([
    ...orphanLeaseTenant.map((a) => a.row.leaseId),
    ...orphanLeaseUnit.map((a) => a.row.leaseId),
    ...unparseableLeaseDates.map((a) => a.row.leaseId),
  ]);
  const committableLeaseIds = new Set(
    bundle.leases.filter((l) => !orphanLeaseIds.has(l.leaseId)).map((l) => l.leaseId)
  );

  const committable = {
    tenants: uniqueTenantIds.size,
    units: uniqueUnitIds.size,
    leases: committableLeaseIds.size,
    charges: bundle.charges.filter(
      (c) => committableLeaseIds.has(c.leaseId) && c.chargeDate !== null
    ).length,
    payments: bundle.payments.filter(
      (p) => committableLeaseIds.has(p.leaseId) && p.paymentDate !== null
    ).length,
    workOrders: bundle.workOrders.filter(
      (w) => uniqueUnitIds.has(w.unitId) && w.openedDate !== null
    ).length,
  };

  return {
    counts: {
      tenants: bundle.tenants.length,
      units: bundle.units.length,
      leases: bundle.leases.length,
      charges: bundle.charges.length,
      payments: bundle.payments.length,
      workOrders: bundle.workOrders.length,
      properties: variantMap.size,
    },
    propertyVariants,
    tenantAnomalies: {
      duplicateIds: duplicateTenantIds,
      duplicateEmails: duplicateTenantEmails,
      malformedEmails: malformedTenantEmails,
      missingEmail,
      missingPhone,
      unparseableDob,
    },
    unitAnomalies: {
      duplicateIds: duplicateUnitIds,
      negativeSqft,
      nullRent,
    },
    leaseAnomalies: {
      duplicateIds: duplicateLeaseIds,
      orphanTenant: orphanLeaseTenant,
      orphanUnit: orphanLeaseUnit,
      endBeforeStart,
      overlappingActive,
      unparseableDates: unparseableLeaseDates,
    },
    chargeAnomalies: {
      orphanLease: orphanChargeLease,
      negativeAmount: negativeCharge,
      unparseableDate: unparseableChargeDate,
    },
    paymentAnomalies: {
      orphanLease: orphanPaymentLease,
      zeroAmount: zeroPayments,
      splitPayments,
      unparseableDate: unparseablePayDate,
    },
    workOrderAnomalies: {
      openNoClosedDate,
      negativeCost,
      unparseableDate: unparseableWoDate,
    },
    committable,
  };
}
