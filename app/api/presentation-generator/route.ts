import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

const PRESENTON_URL = "https://api.presenton.ai";

export async function POST(req: NextRequest) {
  const { topic, nSlides, tone, additionalNotes } = await req.json();

  if (!topic?.trim()) {
    return NextResponse.json({ error: "Topic is required" }, { status: 400 });
  }

  const content = additionalNotes?.trim()
    ? `${topic.trim()}\n\nAdditional instructions: ${additionalNotes.trim()}`
    : topic.trim();

  let generateData: { path?: string; presentation_id?: string };
  try {
    const generateRes = await fetch(`${PRESENTON_URL}/api/v3/presentation/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PRESENTON_API_KEY}`,
      },
      body: JSON.stringify({
        content,
        n_slides: nSlides ?? 10,
        tone: tone ?? "educational",
        language: "English",
        export_as: "pptx",
        standard_template: "general",
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

  if (!generateData.path) {
    return NextResponse.json({ error: "No presentation path returned" }, { status: 500 });
  }

  return NextResponse.json({
    editPath: (generateData as { edit_path?: string }).edit_path ?? null,
    downloadPath: generateData.path,
  });
}
