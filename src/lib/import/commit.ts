// Commit a parsed bundle to the database.
//
// Idempotency: every model has an `externalId @unique` field set to the
// source system's identifier. We upsert on externalId so re-running the
// same import never double-writes. The ImportRun audit row captures
// what was touched + which rows were skipped, so a property manager
// can reconcile.

import "server-only";
import type { DbClient } from "@/lib/prisma";
import { ParsedBundle } from "./parse";
import { analyzeBundle, PreviewReport } from "./analyze";

export type CommitResult = {
  importRunId: string;
  counts: {
    tenants: number;
    units: number;
    leases: number;
    charges: number;
    payments: number;
    workOrders: number;
    properties: number;
  };
  skipped: {
    leases: number;
    charges: number;
    payments: number;
    workOrders: number;
  };
  report: PreviewReport;
};

export async function commitBundle(
  prisma: DbClient,
  bundle: ParsedBundle
): Promise<CommitResult> {
  const report = analyzeBundle(bundle);

  // ---- Properties (upsert by canonical name) ----
  const canonicalNames = Array.from(
    new Set(bundle.units.map((u) => u.propertyNameCanonical))
  );
  const propertyIdByCanonical = new Map<string, string>();
  for (const canonical of canonicalNames) {
    const p = await prisma.property.upsert({
      where: { name: canonical },
      update: {},
      create: { name: canonical },
    });
    propertyIdByCanonical.set(canonical, p.id);
  }

  // ---- Tenants (upsert by externalId). Dedupe within import. ----
  const tenantsSeen = new Set<string>();
  let tenantCount = 0;
  for (const t of bundle.tenants) {
    if (tenantsSeen.has(t.tenantId)) continue;
    tenantsSeen.add(t.tenantId);
    await prisma.tenant.upsert({
      where: { externalId: t.tenantId },
      update: {
        firstName: t.firstName,
        lastName: t.lastName,
        email: t.email,
        phone: t.phone,
      },
      create: {
        externalId: t.tenantId,
        firstName: t.firstName,
        lastName: t.lastName,
        email: t.email,
        phone: t.phone,
      },
    });
    tenantCount++;
  }

  // ---- Units ----
  const unitsSeen = new Set<string>();
  let unitCount = 0;
  for (const u of bundle.units) {
    if (unitsSeen.has(u.unitId)) continue;
    unitsSeen.add(u.unitId);
    const propertyId = propertyIdByCanonical.get(u.propertyNameCanonical);
    if (!propertyId) continue;
    await prisma.unit.upsert({
      where: { externalId: u.unitId },
      update: {
        label: u.unitNumber,
        bedrooms: u.bedrooms,
        bathrooms: u.bathrooms,
        sqft: u.squareFeet,
        targetRent: u.monthlyRentTarget,
        propertyId,
      },
      create: {
        externalId: u.unitId,
        label: u.unitNumber,
        bedrooms: u.bedrooms,
        bathrooms: u.bathrooms,
        sqft: u.squareFeet,
        targetRent: u.monthlyRentTarget,
        propertyId,
      },
    });
    unitCount++;
  }

  // ---- Leases (skip orphans + unparseable dates) ----
  const tenantRows = (await prisma.tenant.findMany({ select: { id: true, externalId: true } })) as Array<{ id: string; externalId: string }>;
  const unitRows = (await prisma.unit.findMany({ select: { id: true, externalId: true } })) as Array<{ id: string; externalId: string }>;
  const tenantIdByExt = new Map<string, string>(tenantRows.map((r) => [r.externalId, r.id]));
  const unitIdByExt = new Map<string, string>(unitRows.map((r) => [r.externalId, r.id]));

  const leasesSeen = new Set<string>();
  let leaseCount = 0;
  let leasesSkipped = 0;
  const committedLeaseIds = new Set<string>();
  for (const l of bundle.leases) {
    if (leasesSeen.has(l.leaseId)) continue;
    leasesSeen.add(l.leaseId);
    const tenantId = tenantIdByExt.get(l.tenantId);
    const unitId = unitIdByExt.get(l.unitId);
    if (!tenantId || !unitId || !l.startDate || !l.endDate) {
      leasesSkipped++;
      continue;
    }
    await prisma.lease.upsert({
      where: { externalId: l.leaseId },
      update: {
        tenantId,
        unitId,
        startDate: l.startDate,
        endDate: l.endDate,
        monthlyRent: l.monthlyRent,
        status: l.status,
      },
      create: {
        externalId: l.leaseId,
        tenantId,
        unitId,
        startDate: l.startDate,
        endDate: l.endDate,
        monthlyRent: l.monthlyRent,
        status: l.status,
      },
    });
    committedLeaseIds.add(l.leaseId);
    leaseCount++;
  }

  const leaseRows = (await prisma.lease.findMany({ select: { id: true, externalId: true } })) as Array<{ id: string; externalId: string }>;
  const leaseIdByExt = new Map<string, string>(leaseRows.map((r) => [r.externalId, r.id]));

  // ---- Charges ----
  const chargesSeen = new Set<string>();
  let chargeCount = 0;
  let chargesSkipped = 0;
  for (const c of bundle.charges) {
    if (chargesSeen.has(c.chargeId)) continue;
    chargesSeen.add(c.chargeId);
    const leaseId = leaseIdByExt.get(c.leaseId);
    if (!leaseId || !c.chargeDate) {
      chargesSkipped++;
      continue;
    }
    await prisma.charge.upsert({
      where: { externalId: c.chargeId },
      update: {
        leaseId,
        dueDate: c.chargeDate,
        amount: c.amount,
        category: c.type,
      },
      create: {
        externalId: c.chargeId,
        leaseId,
        dueDate: c.chargeDate,
        amount: c.amount,
        category: c.type,
      },
    });
    chargeCount++;
  }

  // ---- Payments ----
  const paymentsSeen = new Set<string>();
  let paymentCount = 0;
  let paymentsSkipped = 0;
  for (const p of bundle.payments) {
    if (paymentsSeen.has(p.paymentId)) continue;
    paymentsSeen.add(p.paymentId);
    const leaseId = leaseIdByExt.get(p.leaseId);
    if (!leaseId || !p.paymentDate) {
      paymentsSkipped++;
      continue;
    }
    await prisma.payment.upsert({
      where: { externalId: p.paymentId },
      update: {
        leaseId,
        paidDate: p.paymentDate,
        amount: p.amount,
        method: p.method,
      },
      create: {
        externalId: p.paymentId,
        leaseId,
        paidDate: p.paymentDate,
        amount: p.amount,
        method: p.method,
      },
    });
    paymentCount++;
  }

  // ---- Work orders ----
  const workSeen = new Set<string>();
  let workCount = 0;
  let workSkipped = 0;
  for (const w of bundle.workOrders) {
    if (workSeen.has(w.workOrderId)) continue;
    workSeen.add(w.workOrderId);
    const unitId = unitIdByExt.get(w.unitId);
    if (!unitId || !w.openedDate) {
      workSkipped++;
      continue;
    }
    await prisma.workOrder.upsert({
      where: { externalId: w.workOrderId },
      update: {
        unitId,
        description: w.description,
        vendor: w.vendorName,
        cost: w.cost,
        openedDate: w.openedDate,
        closedDate: w.closedDate,
        status: w.status,
      },
      create: {
        externalId: w.workOrderId,
        unitId,
        description: w.description,
        vendor: w.vendorName,
        cost: w.cost,
        openedDate: w.openedDate,
        closedDate: w.closedDate,
        status: w.status,
      },
    });
    workCount++;
  }

  const run = await prisma.importRun.create({
    data: {
      source: "buildium",
      tenantsCreated: tenantCount,
      unitsCreated: unitCount,
      leasesCreated: leaseCount,
      chargesCreated: chargeCount,
      paymentsCreated: paymentCount,
      workOrdersCreated: workCount,
      skippedReport: JSON.stringify({
        leasesSkipped,
        chargesSkipped,
        paymentsSkipped,
        workOrdersSkipped: workSkipped,
        reportSummary: {
          propertyVariants: report.propertyVariants.length,
          orphanLeases:
            report.leaseAnomalies.orphanTenant.length +
            report.leaseAnomalies.orphanUnit.length,
          orphanCharges: report.chargeAnomalies.orphanLease.length,
          orphanPayments: report.paymentAnomalies.orphanLease.length,
          duplicateEmails: report.tenantAnomalies.duplicateEmails.length,
        },
      }),
    },
  });

  return {
    importRunId: run.id,
    counts: {
      tenants: tenantCount,
      units: unitCount,
      leases: leaseCount,
      charges: chargeCount,
      payments: paymentCount,
      workOrders: workCount,
      properties: propertyIdByCanonical.size,
    },
    skipped: {
      leases: leasesSkipped,
      charges: chargesSkipped,
      payments: paymentsSkipped,
      workOrders: workSkipped,
    },
    report,
  };
}
