import { NextRequest, NextResponse } from "next/server";
import { parseBuildiumZip } from "@/lib/import/parse";
import { analyzeBundle } from "@/lib/import/analyze";

export const runtime = "nodejs";

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
    const report = analyzeBundle(bundle);
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
