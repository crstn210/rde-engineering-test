// Server-only AI wrapper for /search query parsing.
// - If ANTHROPIC_API_KEY is set, use Claude Haiku with tool-use for
//   structured output (cheap + fast for a classification/extraction task).
// - If not, fall back to a keyword parser so the app keeps working
//   end-to-end. This matters for: local dev without a key, demo
//   environments, and graceful failure if Anthropic is down.
//
// Both paths return the same shape so callers don't branch.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ALL_SUBMARKETS, canonicalSubmarket, type SearchFilter } from "./listings";

export type ParsedQuery = {
  reply: string;                 // short conversational AI response
  filter: SearchFilter;          // structured filter
  source: "claude" | "fallback"; // for transparency in SUBMISSION.md / Loom
  warning?: string;              // e.g. "I couldn't detect a submarket — showing all results"
};

// ---------------------------------------------------------------------------
// Claude path
// ---------------------------------------------------------------------------

// Model choice: Haiku for this task. The query parser is pure extraction +
// a one-sentence reply, not long-form synthesis — Haiku is ~10x cheaper than
// Sonnet and fast enough that perceived latency stays under the 500ms feel.
// See SUBMISSION.md W5 for the broader model-routing story.
const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are the search assistant for Beyond the Space, a chat-first NYC office-space search engine.

When the user describes what they're looking for, you do TWO things:

1. Write a short (1–2 sentence), warm, conversational reply acknowledging what they asked. Do NOT list the results — the UI renders listing cards separately. Do NOT ask follow-up questions unless the query is truly unparseable. Never output markdown, bullet points, or headers — just plain prose.

2. Call the match_listings tool with a structured filter.

Known submarkets (use exact casing; if the user's phrasing is ambiguous, pick the closest): ${ALL_SUBMARKETS.join(", ")}.

Heuristics:
- "N people" → assume ~150 SF per person for sfMin, no sfMax.
- "startup" / "small team" → sfMax around 5000 unless a number is given.
- "big" / "large floor plate" → sfMin 15000.
- "sublease" vs "direct" → set subleaseOrDirect; leave blank if not specified.
- Always extract feature keywords from the user's words (e.g. "phone booths", "outdoor", "fiber", "move-in-ready", "pre-built") — pass them as lowercase fragments; the backend does substring matching.

If you cannot identify any submarket, still call the tool with the features/sizes you CAN extract and omit submarket. The UI will show all listings with your reply.`;

const TOOL_DEFINITION = {
  name: "match_listings",
  description: "Return a structured filter matching the user's search intent.",
  input_schema: {
    type: "object" as const,
    properties: {
      submarket: {
        type: "string",
        description:
          "One of the known submarkets, exact casing. Omit if unclear.",
      },
      sfMin: { type: "number", description: "Minimum square footage." },
      sfMax: { type: "number", description: "Maximum square footage." },
      features: {
        type: "array",
        items: { type: "string" },
        description:
          "Lowercase keyword fragments the user mentioned (e.g. 'phone booth', 'fiber').",
      },
      subleaseOrDirect: {
        type: "string",
        enum: ["direct", "sublease", "any"],
      },
    },
    required: [] as string[],
  },
};

async function parseWithClaude(
  query: string,
  client: Anthropic
): Promise<ParsedQuery> {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    tools: [TOOL_DEFINITION],
    tool_choice: { type: "tool", name: "match_listings" },
    messages: [{ role: "user", content: query }],
  });

  let reply = "";
  let filter: SearchFilter = {};

  for (const block of resp.content) {
    if (block.type === "text") {
      reply += block.text;
    } else if (block.type === "tool_use" && block.name === "match_listings") {
      const input = block.input as Partial<SearchFilter>;
      filter = {
        submarket: input.submarket
          ? canonicalSubmarket(input.submarket)
          : undefined,
        sfMin: typeof input.sfMin === "number" ? input.sfMin : undefined,
        sfMax: typeof input.sfMax === "number" ? input.sfMax : undefined,
        features: Array.isArray(input.features) ? input.features : undefined,
        subleaseOrDirect: input.subleaseOrDirect,
      };
    }
  }

  // tool_choice: required forces a tool call, so reply may be empty.
  // Provide a graceful default.
  if (!reply.trim()) {
    reply = "Here's what I found based on your search.";
  }

  const warning =
    filter.submarket && !ALL_SUBMARKETS.includes(filter.submarket)
      ? `I wasn't sure about that neighborhood, so I'm showing all matches.`
      : undefined;

  return { reply, filter, source: "claude", warning };
}

// ---------------------------------------------------------------------------
// Fallback path — regex/keyword based. Deterministic, no network.
// ---------------------------------------------------------------------------

function parseWithFallback(query: string): ParsedQuery {
  const q = query.toLowerCase();
  const filter: SearchFilter = {};

  // Submarket match — try each known submarket as a substring.
  for (const sm of ALL_SUBMARKETS) {
    if (q.includes(sm.toLowerCase())) {
      filter.submarket = sm;
      break;
    }
  }
  // Aliases the spec calls out
  if (!filter.submarket) {
    if (q.includes("grand central")) filter.submarket = "Grand Central";
    if (q.includes("fidi") || q.includes("financial district"))
      filter.submarket = "FiDi";
    if (q.includes("soho")) filter.submarket = "SoHo";
  }

  // Size — "10,000 SF" / "10000 sf" / "25 people"
  const sfMatch = q.match(/([\d,]+)\s*(?:sf|sq\s*ft|square\s*feet)/);
  if (sfMatch) {
    const n = parseInt(sfMatch[1].replace(/,/g, ""), 10);
    if (!isNaN(n)) {
      filter.sfMin = Math.round(n * 0.9);
      filter.sfMax = Math.round(n * 1.25);
    }
  } else {
    const peopleMatch = q.match(/(\d+)\s*(?:people|person|employees|desks|seats)/);
    if (peopleMatch) {
      const headcount = parseInt(peopleMatch[1], 10);
      if (!isNaN(headcount)) filter.sfMin = headcount * 150;
    }
  }

  // Type
  if (q.includes("sublease") || q.includes("sublet")) {
    filter.subleaseOrDirect = "sublease";
  } else if (q.includes("direct lease")) {
    filter.subleaseOrDirect = "direct";
  }

  // Features — catalog a handful likely to match the seeded data
  const featureKeywords = [
    "phone booth",
    "outdoor",
    "terrace",
    "fiber",
    "pre-built",
    "move-in",
    "furnished",
    "exposed brick",
    "natural light",
    "bike",
    "concierge",
    "column-free",
    "leed",
  ];
  const found = featureKeywords.filter((f) => q.includes(f));
  if (found.length) filter.features = found;

  const parts: string[] = [];
  if (filter.submarket) parts.push(`in ${filter.submarket}`);
  if (filter.sfMin && filter.sfMax)
    parts.push(`around ${filter.sfMin.toLocaleString()}–${filter.sfMax.toLocaleString()} SF`);
  else if (filter.sfMin) parts.push(`at least ${filter.sfMin.toLocaleString()} SF`);
  if (filter.subleaseOrDirect && filter.subleaseOrDirect !== "any")
    parts.push(`(${filter.subleaseOrDirect})`);

  const reply = parts.length
    ? `Looking for office space ${parts.join(", ")}. Here's what I found.`
    : "I couldn't pull much structure from that — here are all our current NYC listings.";

  const warning = filter.submarket
    ? undefined
    : "Keyword search only (LLM unavailable). Results may be broader than expected.";

  return { reply, filter, source: "fallback", warning };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function parseSearchQuery(query: string): Promise<ParsedQuery> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return parseWithFallback(query);

  try {
    const client = new Anthropic({ apiKey });
    return await parseWithClaude(query, client);
  } catch (err) {
    // Log server-side; fall back so the user sees results even if Anthropic
    // is rate-limited or down.
    console.error("[ai] Claude call failed, falling back:", err);
    const fallback = parseWithFallback(query);
    return {
      ...fallback,
      warning:
        fallback.warning ??
        "AI assistant is temporarily unavailable — using keyword search.",
    };
  }
}
