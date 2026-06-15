import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { buildSystem } from "@/app/lib/systemPrompt";


export async function POST(req: NextRequest) {
  const body = await req.json();
  const { curriculum, schoolType, staffMember, payScale, responsibilities } = body;

  if (!curriculum || !staffMember?.trim() || !responsibilities?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const payScaleLine = payScale?.trim() ? `Pay scale: ${payScale}` : "";
  const schoolTypeLine = schoolType?.trim() ? `School type: ${schoolType}` : "";

  const prompt = `You are an expert school leader drafting performance management targets for a member of staff in a UK school.

STAFF DETAILS:
- Curriculum: ${curriculum}
${schoolTypeLine ? `- ${schoolTypeLine}` : ""}
- Staff role: ${staffMember}
${payScaleLine ? `- ${payScaleLine}` : ""}
- Responsibilities and target areas: ${responsibilities}

Generate 4–6 performance management targets appropriate for this member of staff, their role, pay scale, and responsibilities. Each target must be SMART — Specific, Measurable, Achievable, Relevant, and Time-bound.

Targets should reflect the Teachers' Standards (or leadership standards if appropriate), the school's likely priorities, and best practice for performance management in UK schools. Where the pay scale indicates a UPS or leadership role, targets should reflect higher-level expectations.

Output ONLY a markdown table with no preamble, title, or explanation. The table must have exactly these columns:

| Objective | Success Criteria | Evidence | Actions / Strategies | Time Scale | Support / Resources | Progress / Review |
|---|---|---|---|---|---|---|

Rules for each cell:
- **Objective**: A clear, specific statement of what the member of staff will achieve. Should be ambitious but realistic. 2–4 sentences.
- **Success Criteria**: Measurable indicators of success — include percentages, frequencies, or observable outcomes where possible. 2–3 sentences.
- **Evidence**: Specific types of evidence that will demonstrate the target has been met (e.g. lesson observation grades, pupil progress data, staff feedback). 1–2 sentences.
- **Actions / Strategies**: Concrete steps the member of staff will take to achieve the target. 2–4 sentences.
- **Time Scale**: Specific timeframes — reference academic terms, half terms, or named months. 1–2 sentences.
- **Support / Resources**: What the school, line manager, or wider team will provide to support this target. 1–2 sentences.
- **Progress / Review**: How and when progress will be reviewed — reference interim check-ins and final review dates. 1–2 sentences.

Each cell must be a single paragraph — no line breaks, no bullet points, no sub-lists inside cells.`;

  return streamChat({
    toolSlug: "performance-management",
    model: "gpt-4o",
    max_tokens: 4000,
    messages: [
      { role: "system", content: buildSystem("You are an expert school leader and performance management specialist with extensive experience in UK schools. You draft rigorous, fair, and motivating performance management targets that align with the Teachers' Standards, school improvement priorities, and individual staff development needs. You are familiar with pay scale expectations at all levels from ECT through to UPS and leadership.") },
      { role: "user", content: prompt },
    ],
  });
}
