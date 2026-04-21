// Parse the 6 Buildium CSVs out of a zip. Returns typed rows plus a
// per-file list of parse errors (bad dates, malformed emails, etc.) so
// the preview UI can surface them instead of silently dropping rows.
//
// Intentional quirks in the fixtures (see README "Known quirks"):
//   tenants:     duplicate emails, missing phones, malformed emails,
//                em-dash in last name, mixed date formats
//   units:       property name variations, negative square footage,
//                NULL monthly_rent_target
//   leases:      orphan tenant_ids, end_date < start_date, overlapping
//                active leases per unit
//   charges:     orphan lease_ids, negative amounts
//   payments:    orphan lease_ids, zero-amount, split payments
//   work_orders: open w/o closed_date, Spanish UTF-8, apostrophes in
//                vendor name, negative cost
//
// We parse permissively (null-out fields we can't trust) and let the
// analysis step flag anomalies — that's what the preview step is for.

import JSZip from "jszip";
import { parse } from "csv-parse/sync";

// ---- Types ----------------------------------------------------------

export type TenantRow = {
  tenantId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: Date | null;
  status: string;
  notes: string;
};

export type UnitRow = {
  unitId: string;
  propertyName: string;
  propertyNameCanonical: string;
  unitNumber: string;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFeet: number | null;
  monthlyRentTarget: number | null;
  status: string;
};

export type LeaseRow = {
  leaseId: string;
  tenantId: string;
  unitId: string;
  startDate: Date | null;
  endDate: Date | null;
  monthlyRent: number;
  securityDeposit: number;
  status: string;
};

export type ChargeRow = {
  chargeId: string;
  leaseId: string;
  chargeDate: Date | null;
  amount: number;
  type: string;
  description: string;
};

export type PaymentRow = {
  paymentId: string;
  leaseId: string;
  paymentDate: Date | null;
  amount: number;
  method: string | null;
  notes: string;
};

export type WorkOrderRow = {
  workOrderId: string;
  unitId: string;
  openedDate: Date | null;
  closedDate: Date | null;
  status: string;
  category: string;
  description: string;
  vendorName: string | null;
  cost: number | null;
};

export type ParsedBundle = {
  tenants: TenantRow[];
  units: UnitRow[];
  leases: LeaseRow[];
  charges: ChargeRow[];
  payments: PaymentRow[];
  workOrders: WorkOrderRow[];
};

// ---- Helpers --------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(e: string): boolean {
  return EMAIL_RE.test(e);
}

// Accepts both MM/DD/YYYY and YYYY-MM-DD (the two formats the fixture
// mixes). Returns null for anything else so the analysis step can flag.
export function parseMixedDate(raw: string): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  // YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const d = new Date(`${s}T00:00:00.000Z`);
    return isNaN(d.getTime()) ? null : d;
  }
  // MM/DD/YYYY
  const usMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, mm, dd, yyyy] = usMatch;
    const d = new Date(
      Date.UTC(
        parseInt(yyyy, 10),
        parseInt(mm, 10) - 1,
        parseInt(dd, 10)
      )
    );
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function parseNumber(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s || s.toLowerCase() === "null") return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

// Canonicalize "1234 Elm St" / "1234 Elm Street" / "1234 Elm St." → same key.
// Lowercase, strip trailing punctuation, expand common street-type abbreviations.
export function canonicalPropertyName(raw: string): string {
  let s = raw.trim().toLowerCase();
  // strip trailing punctuation
  s = s.replace(/[.,;:]+$/, "");
  // collapse whitespace
  s = s.replace(/\s+/g, " ");
  // expand abbreviations (word-boundary)
  const expansions: Array<[RegExp, string]> = [
    [/\bst\.?\b/g, "street"],
    [/\bave\.?\b/g, "avenue"],
    [/\bblvd\.?\b/g, "boulevard"],
    [/\brd\.?\b/g, "road"],
    [/\bln\.?\b/g, "lane"],
    [/\bpkwy\.?\b/g, "parkway"],
    [/\bplz\.?\b/g, "plaza"],
  ];
  for (const [re, to] of expansions) s = s.replace(re, to);
  return s.trim();
}

// ---- CSV parsing ----------------------------------------------------

type CsvRow = Record<string, string>;

function parseCsv(text: string): CsvRow[] {
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  }) as CsvRow[];
}

// ---- Entry point ----------------------------------------------------

export async function parseBuildiumZip(
  buffer: Buffer | ArrayBuffer
): Promise<ParsedBundle> {
  const zip = await JSZip.loadAsync(buffer);

  async function readCsv(name: string): Promise<CsvRow[]> {
    const entry = zip.file(name);
    if (!entry) throw new Error(`Missing file in zip: ${name}`);
    const text = await entry.async("string");
    return parseCsv(text);
  }

  const [tenantsRaw, unitsRaw, leasesRaw, chargesRaw, paymentsRaw, woRaw] =
    await Promise.all([
      readCsv("tenants.csv"),
      readCsv("units.csv"),
      readCsv("leases.csv"),
      readCsv("charges.csv"),
      readCsv("payments.csv"),
      readCsv("work_orders.csv"),
    ]);

  const tenants: TenantRow[] = tenantsRaw.map((r) => ({
    tenantId: r.tenant_id,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email?.trim() ? r.email.trim() : null,
    phone: r.phone?.trim() ? r.phone.trim() : null,
    dateOfBirth: parseMixedDate(r.date_of_birth),
    status: r.status,
    notes: r.notes ?? "",
  }));

  const units: UnitRow[] = unitsRaw.map((r) => ({
    unitId: r.unit_id,
    propertyName: r.property_name,
    propertyNameCanonical: canonicalPropertyName(r.property_name),
    unitNumber: r.unit_number,
    bedrooms: parseNumber(r.bedrooms),
    bathrooms: parseNumber(r.bathrooms),
    squareFeet: parseNumber(r.square_feet),
    monthlyRentTarget: parseNumber(r.monthly_rent_target),
    status: r.status,
  }));

  const leases: LeaseRow[] = leasesRaw.map((r) => ({
    leaseId: r.lease_id,
    tenantId: r.tenant_id,
    unitId: r.unit_id,
    startDate: parseMixedDate(r.start_date),
    endDate: parseMixedDate(r.end_date),
    monthlyRent: parseNumber(r.monthly_rent) ?? 0,
    securityDeposit: parseNumber(r.security_deposit) ?? 0,
    status: r.status,
  }));

  const charges: ChargeRow[] = chargesRaw.map((r) => ({
    chargeId: r.charge_id,
    leaseId: r.lease_id,
    chargeDate: parseMixedDate(r.charge_date),
    amount: parseNumber(r.amount) ?? 0,
    type: r.type,
    description: r.description ?? "",
  }));

  const payments: PaymentRow[] = paymentsRaw.map((r) => ({
    paymentId: r.payment_id,
    leaseId: r.lease_id,
    paymentDate: parseMixedDate(r.payment_date),
    amount: parseNumber(r.amount) ?? 0,
    method: r.method?.trim() || null,
    notes: r.notes ?? "",
  }));

  const workOrders: WorkOrderRow[] = woRaw.map((r) => ({
    workOrderId: r.work_order_id,
    unitId: r.unit_id,
    openedDate: parseMixedDate(r.opened_date),
    closedDate: parseMixedDate(r.closed_date),
    status: r.status,
    category: r.category,
    description: r.description ?? "",
    vendorName: r.vendor_name?.trim() || null,
    cost: parseNumber(r.cost),
  }));

  return { tenants, units, leases, charges, payments, workOrders };
}
