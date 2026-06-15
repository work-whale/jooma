import { NextRequest, NextResponse } from "next/server";
import { buildSystem } from "@/app/lib/systemPrompt";
import { streamChat } from "@/app/lib/usage";

export interface SubjectFocus {
  subject: string;
  strengths: string;
  areasForDevelopment: string;
  targets: string;
}

export interface ReportWriterRequest {
  name: string;
  gender: "Male" | "Female" | "Non-Binary";
  wordCount: number;
  includeTargets: boolean;
  tone: string;
  subjects: SubjectFocus[];
}


function getPronouns(gender: ReportWriterRequest["gender"]) {
  if (gender === "Male") return { subject: "He", object: "him", possessive: "his" };
  if (gender === "Female") return { subject: "She", object: "her", possessive: "her" };
  return { subject: "They", object: "them", possessive: "their" };
}

export async function POST(req: NextRequest) {
  const body: ReportWriterRequest = await req.json();

  const { name, gender, wordCount, includeTargets, tone, subjects } = body;

  if (!name?.trim() || !gender || !subjects?.length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const pronouns = getPronouns(gender);

  const subjectSections = subjects
    .filter((s) => s.subject?.trim())
    .map((s, i) => {
      const lines = [
        `Subject/Focus ${i + 1}: ${s.subject}`,
        `Strengths: ${s.strengths || "N/A"}`,
        `Areas for development: ${s.areasForDevelopment || "N/A"}`,
      ];
      if (includeTargets) lines.push(`Targets: ${s.targets || "N/A"}`);
      return lines.join("\n");
    })
    .join("\n\n");

  const targetInstruction = includeTargets
    ? "After the report paragraph for each subject, include a short 'Target' section with a specific, actionable target for the student."
    : "Do not include any targets.";

  const userPrompt = `Write a high-quality school report for the following pupil. This report will be shared with the pupil's parents or carers and must meet the standards expected of a UK school.

Pupil name: ${name}
Pronouns: ${pronouns.subject} / ${pronouns.object} / ${pronouns.possessive}
Approximate word count: ${wordCount} words total
Tone: ${tone || "formal"}

${subjectSections}

Writing guidelines:

1. Write a separate, well-developed paragraph for each subject/focus area listed above. Each paragraph must:
   - Open with a clear statement of the pupil's overall attainment or engagement in the subject
   - Reference specific strengths with concrete examples of what the pupil does well (e.g. "demonstrates strong analytical skills when interpreting historical sources" rather than "works hard")
   - Acknowledge areas for development honestly but constructively, framing them as opportunities for growth rather than deficiencies
   - Use ${name}'s first name naturally and vary sentence structure to avoid repetitive phrasing across paragraphs
   - Be positive and encouraging in overall tone without being hollow or generic — every strength mentioned must feel earned and specific

2. Pronouns: use ${pronouns.subject} / ${pronouns.object} / ${pronouns.possessive} consistently throughout.

3. ${targetInstruction}

4. The overall report should be approximately ${wordCount} words. Distribute the word count approximately evenly across subjects, adjusting slightly for subjects with more detailed input.

5. Tone: ${tone || "formal"}. If the tone is "formal", use professional, precise language appropriate for an official school document. If "encouraging", lead with positivity while remaining honest. If "concise", prioritise clarity and brevity — avoid padding.

6. Avoid the following common report-writing pitfalls:
   - Vague, generic praise (e.g. "works well", "tries hard", "is a pleasure to teach") without specific evidence
   - Negative language that could discourage the pupil or concern parents unnecessarily
   - Repetitive sentence openers across paragraphs (e.g. starting every sentence with "${name}")
   - References to ability as fixed (e.g. "is naturally gifted" or "struggles with") — frame all comments around effort, progress, and next steps

7. Do not include any emojis.
8. Do not include any personally identifiable information beyond the pupil's first name.
9. Use "## [Subject name]" as the heading for each subject section.`;


  return streamChat({
    toolSlug: "report-writer",
    model: "gpt-4o",
    max_tokens: 4096,
    messages: [
      { role: "system", content: buildSystem("You are an expert UK teacher and form tutor with many years of experience writing high-quality end-of-year and termly school reports for parents and carers. You understand that school reports serve a dual purpose: they celebrate genuine achievement and communicate honest, constructive feedback in a way that motivates pupils and informs parents. Your reports are specific, never generic — every compliment is evidenced and every area for development is framed as an achievable next step. You write in polished UK English and produce reports that reflect well on the school and the teacher.") },
      { role: "user", content: userPrompt },
    ],
  });
}
