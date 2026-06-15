import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { buildSystem } from "@/app/lib/systemPrompt";


export async function POST(req: NextRequest) {
  const body = await req.json();
  const { recipient, content, date, tone } = body;

  if (!recipient?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const dateStr = date
    ? new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const toneGuidance: Record<string, string> = {
    Formal: "Use formal language throughout. Address the recipient respectfully, avoid contractions, and maintain a professional distance. Use 'Yours sincerely' or 'Yours faithfully' as the sign-off.",
    "Semi-formal": "Use a semi-formal tone — professional but approachable. Contractions are acceptable. Use 'Kind regards' or 'Yours sincerely' as the sign-off.",
    Informal: "Use a warm, friendly, and accessible tone appropriate for communicating with parents or community members. Avoid overly formal language. Use 'Kind regards' or 'Many thanks' as the sign-off.",
  };

  const toneInstruction = toneGuidance[tone] || toneGuidance["Semi-formal"];

  const prompt = `Write a professional school letter for a UK school, based on the following details.

INPUTS:
- Recipient: ${recipient}
- Date: ${dateStr}
- Tone: ${tone}
- Key information to include: ${content}

Tone guidance: ${toneInstruction}

Write the letter directly — no preamble, no explanation. Output only the letter itself using proper markdown.

Structure:
# Letter to ${recipient.charAt(0).toUpperCase() + recipient.slice(1)}

${dateStr}

Dear ${recipient.charAt(0).toUpperCase() + recipient.slice(1)},

[Letter body — 2–4 paragraphs. Cover all key information provided. Be clear, concise, and well-organised. Every key point from the summary must be included. Do not invent information not provided — if specific details are missing (e.g. a contact name), use a placeholder like [Name] or [Contact details].]

[Sign-off appropriate to the tone],

[Your Name]
[Your Title/Position]
[Your School]

Write in UK English. Use £ for currency. Use British date conventions. Do not use emojis.`;

  return streamChat({
    toolSlug: "letter-writer",
    model: "gpt-4o",
    max_tokens: 2000,
    messages: [
      { role: "system", content: buildSystem("You are an expert school communications specialist with extensive experience writing clear, professional letters for UK schools to parents, governors, staff, and external stakeholders. You write letters that are well-structured, appropriately toned, and cover all required information concisely.") },
      { role: "user", content: prompt },
    ],
  });
}
