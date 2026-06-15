import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { buildSystem } from "@/app/lib/systemPrompt";

export interface ModelTextGeneratorRequest {
  curriculum: string;
  yearGroup: string;
  write: string;
  features: string;
  keywords?: string | null;
  abilityLevel?: string;
  lengthWords: number;
}


export async function POST(req: NextRequest) {
  const body: ModelTextGeneratorRequest = await req.json();

  const { curriculum, yearGroup, write, features, keywords, abilityLevel = "EXS", lengthWords } = body;

  if (!curriculum || !yearGroup || !write?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const featuresSection = features?.trim()
    ? `\nLanguage and grammatical features to include: ${features}`
    : "";

  const keywordsSection = keywords?.trim()
    ? `\nKeywords to incorporate into the text: ${keywords}`
    : "";

  const abilityLine =
    abilityLevel === "WTS"
      ? "Pitch the text for Working Towards Standard (WTS) pupils — use accessible vocabulary, shorter sentences, and clear structure to reduce cognitive load."
      : abilityLevel === "GDS"
      ? "Pitch the text for Greater Depth Standard (GDS) pupils — use sophisticated vocabulary, complex sentence structures, and high-level craft to stretch and challenge."
      : "Pitch the text at the Expected Standard (EXS) — appropriate challenge and vocabulary for most pupils in this year group.";

  const userPrompt = `Write a high-quality model text for classroom use with the following specifications:

- Curriculum: ${curriculum}
- Year Group: ${yearGroup}
- Text type / what to write: ${write}
- Approximate length: ${lengthWords} words
- ${abilityLine}${featuresSection}${keywordsSection}

This model text is for use in a UK school and will be used as a teaching exemplar for ${yearGroup} pupils. It must be genuinely high quality — not a generic demonstration, but a carefully crafted piece that a teacher could place in front of pupils as an aspirational example of what excellence in ${write} looks like.

The text must:
- Be precisely calibrated to the reading and writing demands of ${yearGroup} pupils — pitched to stretch their understanding and aspiration, but not so far beyond their reach as to be inaccessible
- Demonstrate a range of the features typically expected at ${yearGroup} level in the National Curriculum for English (e.g. varied sentence structures, deliberate vocabulary choices, organisational features appropriate to the text type, effective use of punctuation for effect)
- Be authentic in voice and genre — if it is persuasive writing, it must genuinely persuade; if narrative, it must show craft in characterisation, tension, or description; if non-fiction, it must be accurate and well-structured
- Incorporate the specified language and grammatical features naturally and purposefully — not as a mechanical checklist
- Be free of clichés and avoid hollow, generic phrases

After the model text, include the following annotated analysis section:

## Key Features in This Text

For each of 5–7 significant writing features used in the text, provide:
1. **Feature name**: The precise grammatical or rhetorical term (e.g. "fronted adverbial for dramatic effect", "tricolon", "second-person address for reader engagement")
2. **Example from the text**: Quote the exact sentence or phrase from the text
3. **Why it is effective**: 2–3 sentences explaining the intended effect on the reader and why this technique works in this context — written in language accessible to a ${yearGroup} pupil but precise enough to model the kind of analytical thinking teachers want to develop

Do not use any emojis. Write the model text in the appropriate register and style for ${write}. Write the analysis section in a clear, teacher-friendly tone.`;

  return streamChat({
    toolSlug: "model-text-generator",
    model: "gpt-4o",
    max_tokens: 8192,
    messages: [
      { role: "system", content: buildSystem("You are an expert UK literacy teacher and accomplished writer who creates high-quality model texts for classroom use across KS1, KS2, KS3, and KS4. You have a deep understanding of the National Curriculum for English, the writing features expected at each key stage, and how to craft texts that genuinely inspire pupils. You write with real craft and intentionality — your model texts are not generic demonstrations but carefully composed pieces that exemplify excellence in the specified text type. You annotate your work with precise, accurate literary and grammatical terminology.") },
      { role: "user", content: userPrompt },
    ],
  });
}
