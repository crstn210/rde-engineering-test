import { NextRequest, NextResponse } from "next/server";
import { runNlQuery } from "@/lib/nlquery";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { question?: string };
    const q = (body.question ?? "").trim();
    if (!q) {
      return NextResponse.json({ error: "Empty question" }, { status: 400 });
    }
    const result = await runNlQuery(q);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "query failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
