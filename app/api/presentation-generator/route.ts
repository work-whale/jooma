import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

const PRESENTON_URL = process.env.PRESENTON_SELF_HOSTED_URL ?? "http://localhost:5000";

export async function POST(req: NextRequest) {
  const { topic, nSlides, tone, additionalNotes } = await req.json();

  if (!topic?.trim()) {
    return NextResponse.json({ error: "Topic is required" }, { status: 400 });
  }

  const content = additionalNotes?.trim()
    ? `${topic.trim()}\n\nAdditional instructions: ${additionalNotes.trim()}`
    : topic.trim();

  let generateData: { path?: string; presentation_id?: string; edit_path?: string };
  try {
    const generateRes = await fetch(`${PRESENTON_URL}/api/v1/ppt/presentation/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        n_slides: nSlides ?? 10,
        language: "English",
        export_as: "pptx",
        template: "general",
      }),
      signal: AbortSignal.timeout(110_000),
    });

    if (!generateRes.ok) {
      const errText = await generateRes.text().catch(() => "");
      console.error("[presentation-generator] Presenton error:", generateRes.status, errText);
      return NextResponse.json(
        { error: `Presenton ${generateRes.status}: ${errText || "generation failed"}` },
        { status: 500 }
      );
    }

    generateData = await generateRes.json();
    console.log("[presentation-generator] Presenton response:", generateData);
  } catch (err) {
    console.error("[presentation-generator] fetch error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to reach Presenton" },
      { status: 500 }
    );
  }

  if (!generateData.presentation_id && !generateData.path) {
    return NextResponse.json({ error: "No presentation returned" }, { status: 500 });
  }

  const editPath = generateData.edit_path
    ? `${PRESENTON_URL}${generateData.edit_path}`
    : generateData.presentation_id
    ? `${PRESENTON_URL}/presentation?id=${generateData.presentation_id}`
    : null;

  const downloadPath = generateData.path
    ? generateData.path.startsWith("http")
      ? generateData.path
      : `${PRESENTON_URL}${generateData.path}`
    : null;

  return NextResponse.json({ editPath, downloadPath, presentationId: generateData.presentation_id ?? null });
}
