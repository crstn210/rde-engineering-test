# Beyond the Space + PM Platform — RDE Advisors Engineering Test

Candidate: **Cristiam Agudelo** · Submitted 2026-04-21

- **Live deploy:** https://rde-engineering-test.vercel.app
- **Full write-up:** [`SUBMISSION.md`](./SUBMISSION.md) — architecture overview, W1–W5 answers, cost projection, decisions & tradeoffs.

---

## What's in here

Two products, one codebase:

### BTS — NYC office search (chat-first)
- `/` — hero + "Describe your space" textbox + 6 example chips. Server-rendered with JSON-LD `WebSite` + `SearchAction` schema.
- `/search?q=...` — one Claude Haiku call with tool-use returns (a) a conversational reply and (b) a structured filter. Falls back to a keyword parser if no API key is set. Handles "LLM mis-parse" and "valid submarket, zero matches" degraded states.
- `/listings/[slug]` — per-listing detail with photo + floor-plan gallery (arrow keys / thumbs / swipe), space details, floor plan, transit (synthetic-labeled), and a demo broker form. `RealEstateListing` JSON-LD per page.

### PM platform — import + dashboard
- `/import` — drop a Buildium zip OR click "Try with sample data". Preview step surfaces: counts per entity, property-name variants merged, duplicate/malformed emails, orphan tenant/unit/lease refs, overlapping active leases, negative amounts, UTF-8 Spanish descriptions, everything. Commit is idempotent (`externalId`-keyed upsert) — re-running never double-writes. Every import writes an `ImportRun` audit row.
- `/dashboard` — rent roll (sortable, CSV export), AR aging (5 buckets + delinquent tenant list linking to tenant detail), 12-month operating-expenses stacked bar chart (real `WorkOrder.cost` aggregated + clearly-labeled synthetic fill for other categories), and a natural-language query bar.
- `/dashboard/tenants/[id]` — tenant detail with leases, full payment history, full charge history, outstanding balance.

The NL query bar is guardrailed: the model returns structured JSON (never SQL) which is validated against an entity+field whitelist before hitting Prisma. No `$queryRaw`, no writes possible. See `src/lib/nlquery.ts`.

---

## Tech stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript 5**
- **Tailwind 4** (editorial palette — warm cream, deep ink, terracotta) + **Fraunces** display serif
- **Prisma 7** with `@prisma/adapter-pg` against **Neon Postgres**
- **@anthropic-ai/sdk** (Claude Haiku for search parsing + NL queries, with a built-in keyword fallback so the app runs without a key)
- **JSZip** + **csv-parse** for the import pipeline
- Deployed on **Vercel**

---

## Running locally

### 1. Clone + env

```
git clone https://github.com/crstn210/rde-engineering-test.git
cd rde-engineering-test
```

Create `.env` in the project root:

```
DATABASE_URL="postgresql://<user>:<pass>@<host>/<db>?sslmode=require"
# Optional — AI search + NL query fall back to keyword parsing without it.
ANTHROPIC_API_KEY="sk-ant-..."
```

The `DATABASE_URL` must point at Postgres (**Neon direct/unpooled URL** recommended — see "Heads-up" below). Local SQLite is NOT supported by this build — we ship Postgres-flavored migrations because Vercel needs Postgres anyway; keeping one target avoids the SQLite/Postgres schema-drift headache the starter warned about.

> **Heads-up:** Use Neon's **direct (unpooled)** connection string, NOT the pooled/pgbouncer one. `prisma migrate deploy` can flake against the pooler.

### 2. Install + migrate + run

```
npm install           # runs `prisma generate` post-install
npx prisma migrate deploy   # applies the existing migrations
npm run dev           # serves on http://localhost:3000
```

### 3. Load sample data

Visit http://localhost:3000/import → click **"Try with sample data"** → review the preview (it will surface all the intentional CSV quirks) → click **Commit**. Then visit `/dashboard` to see it populated.

You can re-run the sample import — the idempotent upsert by `externalId` means nothing double-writes.

### 4. With an Anthropic key

With `ANTHROPIC_API_KEY` set, the source pill on `/search` flips from "Keyword fallback" to "Claude Haiku" and natural phrasing ("I need a cool spot for a 12-person startup near Penn Station") gets parsed properly.

---

## Deploying

Already deployed at https://rde-engineering-test.vercel.app. To deploy your own:

1. Import the repo into Vercel (auto-detects Next.js).
2. Set `DATABASE_URL` env var to your Neon direct/unpooled connection string (all three scopes: Production, Preview, Development).
3. Optional: set `ANTHROPIC_API_KEY` for the Claude path.
4. Build runs `prisma generate && prisma migrate deploy && next build` from `vercel.json`.
5. Settings → Deployment Protection → **None** (submission requires a public URL).

---

## Known quirks the import handles

See the **"Edge cases surfaced in the import"** section of `SUBMISSION.md` for the full list. Summary:

- Property-name canonicalization (`1234 Elm St` / `1234 Elm Street` / `1234 Elm St.` → one record)
- Duplicate tenant emails
- Malformed emails
- Orphan tenant_ids / unit_ids / lease_ids
- Mixed date formats (MM/DD/YYYY and YYYY-MM-DD)
- Negative square footage, negative charge amounts, zero-amount payments
- Overlapping active leases on the same unit
- UTF-8 Spanish work-order descriptions
- Vendor names with apostrophes (e.g. `O'Malley & Sons`)

All are surfaced in the `/import` preview UI. None are silently dropped.

---

## Project structure

```
prisma/
  schema.prisma            PM domain: Property, Unit, Tenant, Lease,
                           Charge, Payment, WorkOrder, ImportRun
src/
  app/
    page.tsx               BTS home (hero + textbox + chips)
    search/page.tsx        BTS AI-powered search
    listings/[slug]/       BTS listing detail w/ gallery
    import/page.tsx        PM one-button import UI
    dashboard/page.tsx     PM dashboard composition
    dashboard/tenants/     PM tenant detail
    api/import/preview/    Preview endpoint (stateless, multipart)
    api/import/commit/     Commit endpoint (idempotent upsert)
    api/nlquery/           NL query endpoint (guardrailed)
  components/
    SearchBox.tsx          BTS chat-style input
    ListingCard.tsx        BTS result card
    ListingGallery.tsx     Listing detail gallery (keyboard + touch)
    dashboard/             RentRoll, AgingBuckets, ExpenseChart, NLQueryBar
  lib/
    listings.ts            Listings loader + submarket canonicalization
    ai.ts                  BTS query parser (Claude + fallback)
    nlquery.ts             Dashboard NL query (Claude + whitelist + fallback)
    dashboard.ts           Rent-roll, AR-aging, expense queries
    import/
      parse.ts             Zip + 6 CSVs → typed bundle
      analyze.ts           Preview report (anomalies + counts)
      commit.ts            Idempotent upsert
    prisma.ts              Prisma v7 client + @prisma/adapter-pg
data/
  listings.json            25 synthetic NYC office listings
  buildium_export.zip      Sample PM export (also copied to public/sample/)
public/
  sample/buildium_export.zip   Exposed for the "Try with sample" button
  images/listings/         SVG listing hero/photos
  floorplans/              SVG floor plans
```

---

## AI tool disclosure

Built with **Claude Code** (Anthropic's CLI) as the only assistant. Every generated diff was reviewed before commit. No Cursor, no Copilot. See the Loom walkthrough for decision-level callouts.
