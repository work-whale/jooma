// The Exam Papers prompt: a paper as a sheet (app/lib/sheets), one section per
// question, its parts as question blocks, the mark scheme in each part's
// answer and criteria. The style (app/lib/sheets/exam-styles.ts) sets how it
// is put together; the questions are always original.

import { buildSystem } from "@/app/lib/systemPrompt";
import { sheetResponseFormat } from "@/app/lib/sheets/schema";
import { durationText, examStyle, isExamStyle, tierOf } from "@/app/lib/sheets/exam-styles";

export interface ExamPaperRequest {
  curriculum: string;
  yearGroup: string;
  subject: string;
  topic: string;
  /** app/lib/sheets/exam-styles.ts; missing or unknown is a school test. */
  examStyle?: string;
  tier?: string;
  minutes?: number;
  /** Specification content or bullet points to cover. */
  content?: string | null;
  numQuestions?: number;
  minMarks?: number;
  maxMarks?: number;
  includeMarkScheme?: boolean;
}

const SYSTEM =
  "You are an experienced UK examiner and head of department who writes practice exam papers and mark schemes for Key Stage 2 to GCSE. " +
  "Your papers are accurate, precisely pitched, use command words exactly as exam boards define them, rise in demand through the paper, and come with a mark scheme a colleague could mark from without asking. " +
  "Every question you write is original: you never copy or paraphrase a real exam board question. " +
  "You return the paper as JSON that matches the given schema exactly. Write in UK English with UK spelling. Never use LaTeX: write maths with plain symbols such as × ÷ ² √ and fractions such as 3/4. Do not use long dashes.";

const clamp = (n: unknown, lo: number, hi: number, fallback: number) => {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.min(hi, Math.max(lo, v));
};

export function examRequest(body: ExamPaperRequest):
  | { messages: { role: "system" | "user"; content: string }[]; response_format: ReturnType<typeof sheetResponseFormat> }
  | { error: string } {
  const style = examStyle(body.examStyle);
  if (body.examStyle && !isExamStyle(body.examStyle)) return { error: "Unknown exam style" };
  const subject = style.subject ?? body.subject?.trim();
  if (!body.curriculum || !body.yearGroup || !subject || !body.topic?.trim()) return { error: "Missing required fields" };

  const n = clamp(body.numQuestions, 1, 20, 5);
  const lo = clamp(body.minMarks, 1, 20, 2);
  const hi = Math.max(lo, clamp(body.maxMarks, 1, 20, 6));
  const tier = tierOf(style, subject, body.tier);
  const minutes = clamp(body.minutes, 10, 240, style.minutes);
  const content = body.content?.trim() ? `\nCover this content (from the teacher):\n${body.content.trim().slice(0, 6000)}` : "";
  const level = [style.level, subject, tier ? `${tier === "higher" ? "Higher" : "Foundation"} tier` : ""].filter(Boolean).join(", ");

  const user = `Write a practice exam paper.

- Style: ${style.label}${style.board ? ` (in the style of ${style.board}, never copying its papers)` : ""}
- Level: ${level || subject}
- Year group: ${body.yearGroup}
- Curriculum: ${body.curriculum}
- Topic: ${body.topic.trim()}
- Time allowed: ${durationText(minutes)}${content}

HOW THIS STYLE'S PAPERS ARE PUT TOGETHER
${style.guide}

STRUCTURE
- Exactly ${n} questions: sections titled ${Array.from({ length: n }, (_, i) => `"Question ${i + 1}"`).join(", ")}, no more and no fewer. Each section has emoji "", instructions holding the question's opening context or source if it has one (else ""), and blocks holding its parts.
- Every question has at least one part that is a question block with marks; context goes in instructions, never in a text block on its own.
- A question has 1 to 4 parts. Each part's marks are shown to candidates. Each question's parts add up to between ${lo} and ${hi} marks, with earlier questions nearer ${lo} and later ones nearer ${hi}, so demand rises through the paper.${style.passage ? "\n- Put the reading text first, as its own section titled \"Reading text\" holding one passage block (300 to 600 words, age appropriate), then the questions on it." : ""}
- Start each part with its command word (for example State, Give, Name, Describe, Explain, Calculate, Compare, Suggest, Evaluate) and match the marks to the command: 1 to 2 marks to state or give, 2 to 4 to describe or explain, 4 to 6 or more to evaluate or for an extended answer.
- Answer space: a short answer gets about 2 lines a mark (lines 2 to 6); a long answer (6 marks or more) gets about 2 lines a mark (lines 8 to 16); a calculation has working on.
- tier: ${tier ? `${tier}. Pitch every question for the ${tier} tier.` : "none."}

MARK SCHEME (in each part)
- mcq: answers holds the right option.
- short and calc: answer gives the accepted answer as mark points, one for each mark, separated by "; " (for example "light intensity (1); temperature (1)"), with "Accept" or "Do not accept" notes where useful. A calculation's answer gives the final value with units and says where method marks are given.
- long: answer summarises the indicative content; criteria lists the mark points, or for 6 marks or more the levels, as "Level 3 (5 to 6 marks): ...", "Level 2 (3 to 4 marks): ...", "Level 1 (1 to 2 marks): ...".
- teacherNotes: 1 or 2 short notes for the teacher, such as the content each question covers and the errors to watch for.

ORIGINALITY
Write new questions in the style described. Never reproduce, adapt or paraphrase a question from a real exam board paper, specimen or mark scheme.

title: a short title for the paper, for example "${subject}: ${body.topic.trim()}". objective: "". intro: an empty callout (all fields "").`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: user },
    ],
    // The schema holds the model to the number of questions (and a reading
    // paper's text section): asking in words alone was not always followed.
    response_format: sheetResponseFormat({
      tool: "exam",
      kinds: style.kinds,
      passage: style.passage,
      images: false,
      sectionCount: { min: n + (style.passage ? 1 : 0), max: n + (style.passage ? 1 : 0) },
    }),
  };
}
