import { NextRequest, NextResponse } from "next/server";
import { parseBuildiumZip } from "@/lib/import/parse";
import { commitBundle } from "@/lib/import/commit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
// Import can take a moment on cold-start + Postgres round-trips.
// Keep the default Vercel function timeout generous.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No file uploaded under field 'file'." },
        { status: 400 }
      );
    }
    const ab = await file.arrayBuffer();
    const bundle = await parseBuildiumZip(ab);
    const result = await commitBundle(prisma, bundle);
    return NextResponse.json({
      ok: true,
      importRunId: result.importRunId,
      counts: result.counts,
      skipped: result.skipped,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[import/commit]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
