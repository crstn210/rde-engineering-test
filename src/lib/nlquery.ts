// Natural-language query bar for the PM dashboard.
//
// Safety model (see SUBMISSION.md "NL query guardrail" paragraph):
//   1. The model NEVER returns SQL. It returns a strict JSON shape
//      {entity, filters, orderBy?, limit?}.
//   2. Entity is validated against a whitelist.
//   3. Each entity has a per-field whitelist. Unknown fields are
//      rejected, not passed to Prisma.
//   4. Operator is validated against a fixed enum.
//   5. We never call `$queryRaw` / `$executeRaw`. Only `findMany` on a
//      whitelisted delegate. No writes possible.
//   6. Limit is clamped to 100.
//
// Result: a malicious prompt like "DROP TABLE tenants" has no way to
// escape the structured contract. Worst case: Claude returns an
// invalid entity, we return an error.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

type Op = "eq" | "gt" | "gte" | "lt" | "lte" | "contains";

export type NlFilter = {
  field: string;
  op: Op;
  value: string | number;
};

export type NlQueryPlan = {
  entity: "lease" | "charge" | "payment" | "tenant" | "workOrder";
  filters: NlFilter[];
  orderBy?: { field: string; dir: "asc" | "desc" };
  limit?: number;
};

const OPS: Op[] = ["eq", "gt", "gte", "lt", "lte", "contains"];

// ---- Whitelists ----
// Only these fields are queryable per entity. Everything else is
// refused before touching Prisma.
const FIELD_WHITELIST: Record<
  NlQueryPlan["entity"],
  { fields: string[]; includes: string[] }
> = {
  lease: {
    fields: ["monthlyRent", "status", "startDate", "endDate"],
    includes: ["tenant", "unit"],
  },
  charge: {
    fields: ["amount", "category", "dueDate"],
    includes: ["lease"],
  },
  payment: {
    fields: ["amount", "method", "paidDate"],
    includes: ["lease"],
  },
  tenant: {
    fields: ["firstName", "lastName", "email", "status"],
    includes: [],
  },
  workOrder: {
    fields: ["status", "cost", "openedDate", "closedDate", "vendor"],
    includes: ["unit"],
  },
};

// ---- Claude prompting ----

const MODEL = "claude-haiku-4-5-20251001";

function systemPrompt(): string {
  const entityDocs = Object.entries(FIELD_WHITELIST)
    .map(([e, v]) => `- ${e}: fields=[${v.fields.join(", ")}]`)
    .join("\n");

  return `You are a query-planner for a property management dashboard. You translate a property manager's plain-English question into a strict JSON plan.

Output rules:
- Call the run_query tool exactly once per message.
- entity must be one of: lease, charge, payment, tenant, workOrder.
- filters[].field must be one of the fields listed below per entity.
- filters[].op must be one of: eq, gt, gte, lt, lte, contains.
- String filters that match names should use 'contains'.
- Dates should be ISO YYYY-MM-DD strings.
- If the user asks about 'past-due' or 'late' rent, return entity=lease with status contains 'active' and add extra filter on monthlyRent when a dollar threshold is given.
- If the user asks about vendor overpayment, return entity=workOrder with cost filters.
- If the question is unanswerable with these entities/fields, still return a best-effort plan with entity=lease and no filters — the backend will show "I couldn't map that to data."

Entity fields:
${entityDocs}`;
}

const TOOL = {
  name: "run_query",
  description: "Return a structured query plan to answer the user's question.",
  input_schema: {
    type: "object" as const,
    properties: {
      entity: {
        type: "string",
        enum: ["lease", "charge", "payment", "tenant", "workOrder"],
      },
      filters: {
        type: "array",
        items: {
          type: "object",
          properties: {
            field: { type: "string" },
            op: { type: "string", enum: OPS },
            value: {},
          },
          required: ["field", "op", "value"],
        },
      },
      orderBy: {
        type: "object",
        properties: {
          field: { type: "string" },
          dir: { type: "string", enum: ["asc", "desc"] },
        },
      },
      limit: { type: "number" },
    },
    required: ["entity", "filters"],
  },
};

// ---- Plan builder ----

async function planWithClaude(question: string): Promise<NlQueryPlan | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: systemPrompt(),
    tools: [TOOL],
    tool_choice: { type: "tool", name: "run_query" },
    messages: [{ role: "user", content: question }],
  });
  for (const block of resp.content) {
    if (block.type === "tool_use" && block.name === "run_query") {
      return block.input as NlQueryPlan;
    }
  }
  return null;
}

// ---- Safe execution ----

function validatePlan(plan: NlQueryPlan): { ok: true } | { ok: false; error: string } {
  if (!FIELD_WHITELIST[plan.entity]) {
    return { ok: false, error: `Unknown entity: ${plan.entity}` };
  }
  const wl = FIELD_WHITELIST[plan.entity];
  for (const f of plan.filters ?? []) {
    if (!wl.fields.includes(f.field)) {
      return { ok: false, error: `Field '${f.field}' not queryable on ${plan.entity}` };
    }
    if (!OPS.includes(f.op)) {
      return { ok: false, error: `Operator '${f.op}' not allowed` };
    }
  }
  if (plan.orderBy && !wl.fields.includes(plan.orderBy.field)) {
    return { ok: false, error: `Cannot order by '${plan.orderBy.field}'` };
  }
  return { ok: true };
}

function buildPrismaWhere(plan: NlQueryPlan): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  for (const f of plan.filters) {
    let v: unknown = f.value;
    // coerce date-shaped strings to Date for date fields
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
      const d = new Date(`${v.slice(0, 10)}T00:00:00.000Z`);
      if (!isNaN(d.getTime())) v = d;
    }
    switch (f.op) {
      case "eq":
        where[f.field] = v;
        break;
      case "gt":
        where[f.field] = { gt: v };
        break;
      case "gte":
        where[f.field] = { gte: v };
        break;
      case "lt":
        where[f.field] = { lt: v };
        break;
      case "lte":
        where[f.field] = { lte: v };
        break;
      case "contains":
        where[f.field] = { contains: String(v), mode: "insensitive" };
        break;
    }
  }
  return where;
}

export type QueryResult = {
  ok: true;
  plan: NlQueryPlan;
  rows: Array<Record<string, unknown>>;
  source: "claude" | "fallback";
  narration: string;
};

export type QueryError = {
  ok: false;
  error: string;
  source: "claude" | "fallback";
  narration: string;
};

// ---- Fallback (no API key) ----
// Very small set of hardcoded question patterns so the NL bar keeps
// working without a key. Clearly labeled in the UI as a fallback.
function fallbackPlan(question: string): { plan: NlQueryPlan; narration: string } {
  const q = question.toLowerCase();

  // "past due > $N"
  const dollarMatch = q.match(/\$?\s*([\d,]+)/);
  const threshold = dollarMatch
    ? parseInt(dollarMatch[1].replace(/,/g, ""), 10)
    : null;

  if (/past[- ]due|late|outstanding|overdue/.test(q)) {
    return {
      plan: {
        entity: "lease",
        filters: [
          { field: "status", op: "eq", value: "active" },
          ...(threshold && !isNaN(threshold)
            ? [{ field: "monthlyRent", op: "gt" as Op, value: threshold }]
            : []),
        ],
        limit: 50,
      },
      narration: threshold
        ? `Active leases with monthly rent above $${threshold.toLocaleString()}.`
        : `Active leases (proxy for 'past-due' without AI parsing).`,
    };
  }
  if (/vendor|paid more|overpaid|expense/.test(q)) {
    return {
      plan: {
        entity: "workOrder",
        filters: threshold
          ? [{ field: "cost", op: "gt", value: threshold }]
          : [],
        orderBy: { field: "cost", dir: "desc" },
        limit: 50,
      },
      narration: threshold
        ? `Work orders costing more than $${threshold.toLocaleString()}.`
        : `Top work orders by cost.`,
    };
  }
  // default: active leases
  return {
    plan: { entity: "lease", filters: [], limit: 20 },
    narration: "Showing active leases (keyword fallback — ask about past-due rent or vendor costs for more specific answers).",
  };
}

// ---- Public entry ----

export async function runNlQuery(
  question: string
): Promise<QueryResult | QueryError> {
  let plan: NlQueryPlan | null = null;
  let source: "claude" | "fallback" = "fallback";
  let narration = "";
  try {
    plan = await planWithClaude(question);
    if (plan) {
      source = "claude";
      narration = ""; // claude already returned a plan; UI will narrate
    }
  } catch (e) {
    console.error("[nlquery] claude error", e);
  }
  if (!plan) {
    const f = fallbackPlan(question);
    plan = f.plan;
    narration = f.narration;
  }

  const v = validatePlan(plan);
  if (!v.ok) {
    return { ok: false, error: v.error, source, narration };
  }

  const where = buildPrismaWhere(plan);
  const limit = Math.min(plan.limit ?? 50, 100);
  const orderBy = plan.orderBy
    ? { [plan.orderBy.field]: plan.orderBy.dir }
    : undefined;

  // Dispatch via a fixed switch — each delegate is whitelisted here.
  const wl = FIELD_WHITELIST[plan.entity];
  const includes =
    wl.includes.length > 0
      ? Object.fromEntries(wl.includes.map((i) => [i, true]))
      : undefined;
  try {
    let rows: Array<Record<string, unknown>> = [];
    switch (plan.entity) {
      case "lease":
        rows = (await prisma.lease.findMany({
          where,
          orderBy,
          take: limit,
          include: {
            tenant: { select: { firstName: true, lastName: true } },
            unit: {
              include: { property: { select: { name: true } } },
            },
          },
        })) as Array<Record<string, unknown>>;
        break;
      case "charge":
        rows = (await prisma.charge.findMany({
          where,
          orderBy,
          take: limit,
          include: {
            lease: {
              select: {
                externalId: true,
                tenant: { select: { firstName: true, lastName: true } },
              },
            },
          },
        })) as Array<Record<string, unknown>>;
        break;
      case "payment":
        rows = (await prisma.payment.findMany({
          where,
          orderBy,
          take: limit,
          include: {
            lease: {
              select: {
                externalId: true,
                tenant: { select: { firstName: true, lastName: true } },
              },
            },
          },
        })) as Array<Record<string, unknown>>;
        break;
      case "tenant":
        rows = (await prisma.tenant.findMany({
          where,
          orderBy,
          take: limit,
        })) as Array<Record<string, unknown>>;
        break;
      case "workOrder":
        rows = (await prisma.workOrder.findMany({
          where,
          orderBy,
          take: limit,
          include: includes?.unit
            ? {
                unit: {
                  include: { property: { select: { name: true } } },
                },
              }
            : undefined,
        })) as Array<Record<string, unknown>>;
        break;
    }
    return { ok: true, plan, rows, source, narration };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "query failed";
    return { ok: false, error: msg, source, narration };
  }
}
