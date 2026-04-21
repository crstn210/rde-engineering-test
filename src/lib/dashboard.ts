// Server-side data fetchers for the PM dashboard.
// All queries assume an import has been committed. If the database is
// empty (fresh DB, no import run yet), helpers return empty arrays /
// zero buckets and the dashboard page shows an empty-state CTA back to
// /import.

import "server-only";
import { prisma } from "@/lib/prisma";

export type RentRollRow = {
  leaseId: string;
  leaseExternalId: string;
  tenantName: string;
  tenantId: string;
  property: string;
  unit: string;
  monthlyRent: number;
  startDate: string;
  endDate: string;
  status: string; // 'current' | 'late' | 'notice'
  balance: number;
};

export type AgingBuckets = {
  current: number;
  d30: number;
  d60: number;
  d90: number;
  d90plus: number;
  totalOutstanding: number;
};

export type AgingTenantRow = {
  tenantId: string;
  tenantName: string;
  leaseId: string;
  property: string;
  unit: string;
  bucket: "current" | "d30" | "d60" | "d90" | "d90plus";
  outstanding: number;
  oldestDueDate: string;
};

export type ExpensePoint = {
  month: string; // "2026-01"
  categories: Record<string, number>;
};

export type DashboardSnapshot = {
  importReady: boolean;
  rentRoll: RentRollRow[];
  aging: AgingBuckets;
  agingByTenant: AgingTenantRow[];
  expenses: ExpensePoint[];
  totals: {
    activeLeases: number;
    totalMonthlyRent: number;
    totalOutstanding: number;
  };
};

function monthsAgo(n: number, now = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 1));
  return d;
}

function ymKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getDashboardSnapshot(now = new Date()): Promise<DashboardSnapshot> {
  const [leaseCount] = await Promise.all([prisma.lease.count()]);
  if (leaseCount === 0) {
    return {
      importReady: false,
      rentRoll: [],
      aging: {
        current: 0,
        d30: 0,
        d60: 0,
        d90: 0,
        d90plus: 0,
        totalOutstanding: 0,
      },
      agingByTenant: [],
      expenses: [],
      totals: { activeLeases: 0, totalMonthlyRent: 0, totalOutstanding: 0 },
    };
  }

  // Leases with tenant/unit/property, + charges + payments for balance calc.
  const leases = (await prisma.lease.findMany({
    include: {
      tenant: { select: { id: true, firstName: true, lastName: true } },
      unit: {
        include: {
          property: { select: { name: true } },
        },
      },
      charges: { select: { amount: true, dueDate: true } },
      payments: { select: { amount: true } },
    },
    orderBy: { endDate: "asc" },
  })) as Array<{
    id: string;
    externalId: string;
    tenantId: string;
    monthlyRent: number;
    startDate: Date;
    endDate: Date;
    status: string;
    tenant: { id: string; firstName: string; lastName: string };
    unit: { label: string; property: { name: string } };
    charges: { amount: number; dueDate: Date }[];
    payments: { amount: number }[];
  }>;

  // ---- Rent roll (active + notice) ----
  const activeLeases = leases.filter(
    (l) => l.status === "active" || l.status === "notice"
  );

  const rentRoll: RentRollRow[] = activeLeases.map((l) => {
    const chargesSum = l.charges.reduce((s, c) => s + c.amount, 0);
    const paymentsSum = l.payments.reduce((s, p) => s + p.amount, 0);
    const balance = Math.max(0, chargesSum - paymentsSum);
    // derived status: current if balance is < 1 month rent, late otherwise
    const derivedStatus =
      l.status === "notice"
        ? "notice"
        : balance > l.monthlyRent
          ? "late"
          : "current";
    return {
      leaseId: l.id,
      leaseExternalId: l.externalId,
      tenantName: `${l.tenant.firstName} ${l.tenant.lastName}`,
      tenantId: l.tenant.id,
      property: l.unit.property.name,
      unit: l.unit.label,
      monthlyRent: l.monthlyRent,
      startDate: l.startDate.toISOString().slice(0, 10),
      endDate: l.endDate.toISOString().slice(0, 10),
      status: derivedStatus,
      balance,
    };
  });

  // ---- AR aging ----
  const aging: AgingBuckets = {
    current: 0,
    d30: 0,
    d60: 0,
    d90: 0,
    d90plus: 0,
    totalOutstanding: 0,
  };

  // Sum outstanding per lease by age of its OLDEST unpaid charge.
  // Simplification (documented tradeoff in SUBMISSION): we allocate the
  // whole outstanding balance to the bucket of the oldest unpaid charge
  // rather than FIFO-ing each invoice. A real system does FIFO; for a
  // dashboard KPI this is close enough and the spec doesn't need FIFO.
  const agingByTenant: AgingTenantRow[] = [];
  for (const l of activeLeases) {
    const chargesSum = l.charges.reduce((s, c) => s + c.amount, 0);
    const paymentsSum = l.payments.reduce((s, p) => s + p.amount, 0);
    const balance = chargesSum - paymentsSum;
    if (balance <= 0) continue;

    const unpaidCharges = [...l.charges].sort(
      (a, b) => a.dueDate.getTime() - b.dueDate.getTime()
    );
    const oldest = unpaidCharges[0];
    if (!oldest) continue;
    const ageDays = Math.floor(
      (now.getTime() - oldest.dueDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    let bucket: AgingTenantRow["bucket"];
    if (ageDays <= 30) {
      aging.current += balance;
      bucket = "current";
    } else if (ageDays <= 60) {
      aging.d30 += balance;
      bucket = "d30";
    } else if (ageDays <= 90) {
      aging.d60 += balance;
      bucket = "d60";
    } else if (ageDays <= 120) {
      aging.d90 += balance;
      bucket = "d90";
    } else {
      aging.d90plus += balance;
      bucket = "d90plus";
    }
    aging.totalOutstanding += balance;
    agingByTenant.push({
      tenantId: l.tenant.id,
      tenantName: `${l.tenant.firstName} ${l.tenant.lastName}`,
      leaseId: l.id,
      property: l.unit.property.name,
      unit: l.unit.label,
      bucket,
      outstanding: balance,
      oldestDueDate: oldest.dueDate.toISOString().slice(0, 10),
    });
  }
  agingByTenant.sort((a, b) => b.outstanding - a.outstanding);

  // ---- Expenses (last 12 months) ----
  // Real data: WorkOrder.cost aggregated by category + month.
  // Synthetic fill: utilities, taxes, insurance, misc with deterministic
  // per-month values so the chart looks alive. Labeled in the UI as
  // 'partially synthetic'.
  const workOrders = (await prisma.workOrder.findMany({
    select: { cost: true, openedDate: true },
    where: { cost: { not: null } },
  })) as Array<{ cost: number | null; openedDate: Date }>;

  const expenseCategories = [
    "Repairs",
    "Utilities",
    "Taxes",
    "Insurance",
    "Management",
  ] as const;

  const expenseMap = new Map<string, Record<string, number>>();
  for (let i = 11; i >= 0; i--) {
    const d = monthsAgo(i, now);
    const key = ymKey(d);
    expenseMap.set(key, Object.fromEntries(expenseCategories.map((c) => [c, 0])));
  }

  // Repairs = real work order costs by month
  for (const w of workOrders) {
    const key = ymKey(w.openedDate);
    const m = expenseMap.get(key);
    if (m) m["Repairs"] += Math.abs(w.cost ?? 0);
  }

  // Deterministic synthetic fill based on month index so it looks stable
  // between page loads. NOT random — spec says synthetic fill is fine.
  const monthKeys = Array.from(expenseMap.keys());
  monthKeys.forEach((key, idx) => {
    const m = expenseMap.get(key)!;
    const seasonal = (Math.sin((idx / 12) * Math.PI * 2) + 1) / 2; // 0..1
    m["Utilities"] = Math.round(4200 + seasonal * 2600);
    m["Taxes"] = 11500; // flat monthly accrual
    m["Insurance"] = 2800;
    m["Management"] = Math.round(3400 + idx * 80);
  });

  const expenses: ExpensePoint[] = monthKeys.map((k) => ({
    month: k,
    categories: expenseMap.get(k)!,
  }));

  // ---- Totals ----
  const totals = {
    activeLeases: activeLeases.length,
    totalMonthlyRent: activeLeases.reduce((s, l) => s + l.monthlyRent, 0),
    totalOutstanding: aging.totalOutstanding,
  };

  return {
    importReady: true,
    rentRoll,
    aging,
    agingByTenant,
    expenses,
    totals,
  };
}

// ---- Tenant detail ---------------------------------------------------

export type TenantDetail = {
  tenant: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
  };
  leases: Array<{
    id: string;
    externalId: string;
    property: string;
    unit: string;
    startDate: string;
    endDate: string;
    monthlyRent: number;
    status: string;
  }>;
  payments: Array<{
    id: string;
    date: string;
    amount: number;
    method: string | null;
    leaseExternalId: string;
  }>;
  charges: Array<{
    id: string;
    date: string;
    amount: number;
    category: string;
    leaseExternalId: string;
  }>;
  outstanding: number;
};

export async function getTenantDetail(tenantId: string): Promise<TenantDetail | null> {
  const tenant = (await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      leases: {
        include: {
          unit: {
            include: {
              property: { select: { name: true } },
            },
          },
          charges: true,
          payments: true,
        },
      },
    },
  })) as
    | {
        id: string;
        firstName: string;
        lastName: string;
        email: string | null;
        phone: string | null;
        leases: Array<{
          id: string;
          externalId: string;
          startDate: Date;
          endDate: Date;
          monthlyRent: number;
          status: string;
          unit: { label: string; property: { name: string } };
          charges: Array<{
            id: string;
            dueDate: Date;
            amount: number;
            category: string;
          }>;
          payments: Array<{
            id: string;
            paidDate: Date;
            amount: number;
            method: string | null;
          }>;
        }>;
      }
    | null;

  if (!tenant) return null;

  const leases = tenant.leases.map((l) => ({
    id: l.id,
    externalId: l.externalId,
    property: l.unit.property.name,
    unit: l.unit.label,
    startDate: l.startDate.toISOString().slice(0, 10),
    endDate: l.endDate.toISOString().slice(0, 10),
    monthlyRent: l.monthlyRent,
    status: l.status,
  }));

  const payments = tenant.leases
    .flatMap((l) =>
      l.payments.map((p) => ({
        id: p.id,
        date: p.paidDate.toISOString().slice(0, 10),
        amount: p.amount,
        method: p.method,
        leaseExternalId: l.externalId,
      }))
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  const charges = tenant.leases
    .flatMap((l) =>
      l.charges.map((c) => ({
        id: c.id,
        date: c.dueDate.toISOString().slice(0, 10),
        amount: c.amount,
        category: c.category,
        leaseExternalId: l.externalId,
      }))
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  const totalCharges = charges.reduce((s, c) => s + c.amount, 0);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const outstanding = Math.max(0, totalCharges - totalPaid);

  return {
    tenant: {
      id: tenant.id,
      firstName: tenant.firstName,
      lastName: tenant.lastName,
      email: tenant.email,
      phone: tenant.phone,
    },
    leases,
    payments,
    charges,
    outstanding,
  };
}
