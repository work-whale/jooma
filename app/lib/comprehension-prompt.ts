// The comprehension prompt, shared by the paid route and the guest one on
// /create so a guest's sheet is written exactly the way a teacher's is.
//
// Returns a designed sheet (app/lib/sheets): a "Read the text" section holding
// the passage, then one section per reading domain. A teacher's own passage is
// never sent back through the model to be copied out: the model writes only
// the questions, and the passage is placed on the sheet as the teacher wrote it
// (see sheetContext in app/lib/sheets/context.ts).

import { buildSystem } from "@/app/lib/systemPrompt";
import { bandName, bandPitch, differentiationPrompt, isBand, type Differentiate } from "@/app/lib/differentiation";
import { kindsForTypes, sheetResponseFormat } from "@/app/lib/sheets/schema";

export interface GenerateRequest {
  curriculum: string;
  yearGroup: string;
  textSource: "generate" | "own";
  topic?: string;
  ownText?: string;
  passageWordCount?: number;
  contentDomains: string[];
  questionTypes?: string[];
  numQuestions: number;
  complexity?: "Simple" | "Standard" | "Challenging";
  includeAnswerKey?: boolean;
  differentiate?: Differentiate;
  differentiationLevels?: string[];
  /** Set when this request is one band's version of a differentiated set
   *  (app/lib/bands.ts). The passage and questions are then pitched at it. */
  band?: string;
}

const SYSTEM =
  "You are an expert UK English teacher and literacy specialist with in-depth knowledge of the National Curriculum for English and the KS1 to KS4 reading assessment frameworks. " +
  "You create high-quality, age-appropriate reading comprehension activities that develop the full range of reading skills, from retrieval and inference to evaluation. " +
  "Your passages are well crafted and rich enough to sustain real comprehension work, and your questions are precise and matched to the domain they assess. " +
  "You return the activity as JSON that matches the given schema exactly. Write in UK English. " +
  "Never use LaTeX or backslash notation for any numbers or maths: write plain symbols such as × ÷ ² and fractions such as 3/4.";

const QUESTION_TYPE_GUIDANCE: Record<string, string> = {
  "Multiple choice": "Multiple choice: an mcq with 3 or 4 options, one correct and the rest believable distractors.",
  "Short answer": "Short answer: a short question needing one or two sentences (lines 2).",
  "Extended writing": "Extended writing: a long question needing a developed paragraph that draws on evidence (lines 6 to 8).",
  "True / False": "True / False: a truefalse question with 3 or 4 statements about the text.",
  "Gap fill": "Gap fill: a fillblanks question with sentences from or based on the text, ___ for each gap.",
  "Vocabulary in context": "Vocabulary in context: a short question with quote set to the exact word or phrase from the passage, asking what it means as used there or why the author chose it.",
};

/**
 * Validate a request and build its messages and response format. Returns
 * `{ error }` for a request the model should never see.
 */
export function comprehensionMessages(body: GenerateRequest):
  | { error: string }
  | {
      messages: { role: "system" | "user"; content: string }[];
      response_format: ReturnType<typeof sheetResponseFormat>;
    } {
  const {
    curriculum,
    yearGroup,
    textSource,
    topic,
    ownText,
    passageWordCount = 300,
    contentDomains,
    questionTypes = [],
    numQuestions,
    complexity = "Standard",
    includeAnswerKey = true,
    differentiate = "no",
    differentiationLevels = [],
  } = body;

  if (!curriculum || !yearGroup || !textSource || !Array.isArray(contentDomains) || contentDomains.length === 0) {
    return { error: "Missing required fields" };
  }
  if (textSource === "generate" && !topic?.trim()) {
    return { error: "Topic is required when generating text" };
  }
  if (textSource === "own" && !ownText?.trim()) {
    return { error: "Text is required when using own text" };
  }

  const band = isBand(body.band) ? body.band : null;
  const perDomain = Math.min(10, Math.max(1, Math.round(numQuestions || 1)));
  // The supported versions read a shorter passage on the same topic, so the
  // reading load matches the questions.
  const lighter = band === "WBS" || band === "WTS";
  const words = Math.min(1000, Math.max(80, Math.round(passageWordCount * (lighter ? 0.7 : 1))));
  const kinds = kindsForTypes("comprehension", questionTypes);

  const typesLine = questionTypes.length
    ? `Write every question in ONLY these formats${questionTypes.length > 1 ? ", spreading them so each is used" : ""}:\n${questionTypes.map((t) => `  - ${QUESTION_TYPE_GUIDANCE[t] ?? t}`).join("\n")}`
    : "Use a mix of formats that suits the year group: multiple choice, short answers, true or false, a gap fill, and an extended answer for the hardest domain.";

  const complexityLine =
    complexity === "Challenging"
      ? "Include at least one question per domain that needs an extended response or a comparison."
      : complexity === "Simple"
      ? "Keep questions direct: answers found in the text or needing a simple inference."
      : "Balance retrieval and inference, with one higher-order question per domain.";

  const answersLine = includeAnswerKey
    ? "Fill every answer field correctly: they become the answer page. For extended questions, put a model answer in answer and 2 or 3 success criteria in criteria."
    : "The teacher does not want an answer page: leave every answer field empty (empty strings, empty lists, and 0 or [] for indices). Still set pairs and order correctly.";

  const adaptation = band ? "" : differentiationPrompt(differentiate, differentiationLevels);
  const notesLine = band
    ? `teacherNotes: one note titled "How this version is pitched: ${bandName(band)}" with 2 to 4 points on what was adapted for these pupils and how to support them while they read and answer.`
    : adaptation
    ? `teacherNotes: one note titled "Differentiation": ${adaptation}`
    : "teacherNotes: an empty list.";
  const pitchLine = band
    ? `\n- ${bandPitch(band)}${
        textSource === "generate"
          ? " Write the passage itself at this pitch too: same topic, with vocabulary and sentence length to match."
          : " The passage is fixed, so pitch the questions and their support."
      }`
    : "";

  const domainSections = contentDomains
    .map((d, i) => `  ${i + 2}. One section for "${d}": titled with the domain's name (for example "Retrieval"), a fitting emoji, a one-line instruction, and exactly ${perDomain} question${perDomain === 1 ? "" : "s"}, each with domain set to the code at the start of "${d}" (for example "2b").`)
    .join("\n");

  const passageLines =
    textSource === "generate"
      ? `- Write an original, engaging passage on: "${topic}", of about ${words} words, for ${complexity.toLowerCase()} readers in ${yearGroup}. Continuous prose in 3 to 7 paragraphs, no lists. Accurate if non-fiction; crafted, with character and detail, if fiction. Varied sentences and rich but accessible vocabulary.
- sections, in this order:
  1. A section titled "Read the text" (emoji 📖, instruction "Read the text carefully, then answer the questions.") holding ONE passage block (its title and paragraphs), then a wordbank block titled "Key words" with 4 to 6 challenging words from the passage.
${domainSections}`
      : `- The passage is the teacher's own text, given below. It is printed on the sheet exactly as written, so do NOT include a passage block or copy it out.
- sections, one per domain:
${domainSections}`;

  const prompt = `Create a reading comprehension for ${yearGroup} pupils following the ${curriculum}.

HOW TO BUILD IT
- title: ${textSource === "generate" ? "the passage's title" : "a short title for this activity, based on the text"}.
- objective: what the pupil is learning, starting "I am learning to", matched to the chosen domains.
- intro: a one-sentence hook about the subject of the text, variant "fact", label "Did you know?" and a fitting emoji. Leave its text empty if nothing true and interesting fits.
${passageLines}
- Every question must be answerable from the passage. Inference and evaluation questions ask for evidence ("Using evidence from the text, explain..."). Paragraphs are numbered on the sheet, so refer to them ("In paragraph 2...") when it helps.
- marks match the demand: 1 for simple retrieval, 2 or 3 for an inference with evidence, more for extended answers.
- ${complexityLine}
- ${typesLine}${pitchLine}
- ${answersLine}
- ${notesLine}
- No emoji anywhere except the emoji fields. Do not number anything: questions are numbered on the page.${
    textSource === "own" ? `\n\nPASSAGE:\n${ownText}` : ""
  }`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: prompt },
    ],
    response_format: sheetResponseFormat({ tool: "comprehension", kinds, passage: textSource === "generate" }),
  };
}
