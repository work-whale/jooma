// The comprehension prompt, shared by the paid route and the guest one on
// /create so a guest's passage is written exactly the way a teacher's is.
import { buildSystem } from "@/app/lib/systemPrompt";
import { differentiationPrompt, type Differentiate } from "@/app/lib/differentiation";

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
}


const SYSTEM = "You are an expert UK English teacher and literacy specialist with in-depth knowledge of the National Curriculum for English and KS1–KS4 reading assessment frameworks. You create high-quality, age-appropriate reading comprehension activities that develop the full range of reading skills — from retrieval and inference through to evaluation and critical response. Your passages are well-crafted, purposeful, and rich enough to sustain genuine comprehension work. Your questions are precise, unambiguous, and matched to the content domain they are assessing. Write in professional UK English.";

/**
 * Validate a request and build its messages. Returns `{ error }` for a request
 * the model should never see.
 */
export function comprehensionMessages(
  body: GenerateRequest,
):
  | { error: string }
  | { messages: { role: "system" | "user"; content: string }[] } {
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

  const domainList = contentDomains.join(", ");

  const QUESTION_TYPE_GUIDANCE: Record<string, string> = {
    "Multiple choice":
      "Multiple choice — pose a question, then list 3–4 plausible options on separate lines labelled A), B), C), D). Exactly one option must be correct; the others must be believable distractors. Do not reveal the correct option within the question itself.",
    "Short answer":
      "Short answer — require a one- or two-sentence written response.",
    "Extended writing":
      "Extended writing — require a longer, developed paragraph response, typically drawing together several points or evidence from the text.",
    "True / False":
      "True / False — give a statement about the text and ask the pupil to decide whether it is True or False (optionally asking them to justify their choice).",
    "Gap fill":
      "Gap fill — provide a sentence drawn from or based on the text with one or more words removed, shown as a blank (______), for the pupil to complete.",
    "Vocabulary in context":
      "Vocabulary in context — quote a specific word or phrase from the passage and ask the pupil to explain its meaning as it is used in the text.",
  };

  const selectedGuidance = questionTypes
    .map((t) => QUESTION_TYPE_GUIDANCE[t] ?? t)
    .map((g) => `  - ${g}`)
    .join("\n");

  const questionTypeInstruction = questionTypes.length > 0
    ? `\n- You MUST write every question using ONLY the following question format(s)${questionTypes.length > 1 ? ", spreading them across the questions so each selected format is used" : ""}. Do not use any other format:\n${selectedGuidance}`
    : "";

  const answerKeyInstruction = includeAnswerKey
    ? "\nAfter the questions, include a clearly labelled Answer Key section with model answers for each question."
    : "";

  // Opt-in: empty when the teacher chose not to differentiate. Distinct from
  // `complexity`, which pitches the passage's reading demand rather than
  // adapting the task for attainment bands.
  const adaptation = differentiationPrompt(differentiate, differentiationLevels);
  const adaptationInstruction = adaptation
    ? `\n\nDIFFERENTIATION — ${adaptation} Add this as a clearly labelled "Differentiation" section after the questions.`
    : "";

  const complexityInstruction =
    complexity === "Challenging"
      ? "Include at least one question per domain that requires extended written response or comparative analysis."
      : complexity === "Simple"
      ? "Keep questions direct and ensure answers can be found explicitly in the text or require simple inference."
      : "Balance retrieval and inference questions with one higher-order thinking question per domain.";

  const userPrompt =
    textSource === "generate"
      ? `Generate a complete reading comprehension activity on the topic: "${topic}" for ${yearGroup} students following the ${curriculum}.

Part 1 — Reading Passage

Write an original, engaging non-fiction or fiction passage of approximately ${passageWordCount} words. The passage must:
- Be written at a complexity level appropriate for ${complexity} readers in ${yearGroup}
- Use varied sentence structures and a rich but accessible vocabulary suited to the year group
- Contain sufficient content depth to support ${numQuestions} question(s) per content domain
- Be clearly titled with a heading above the passage
- Avoid bullet points or lists — the passage must be written in continuous prose paragraphs
- Be accurate and well-researched if non-fiction; show craft and characterisation if fiction

Part 2 — Comprehension Questions

Below the passage, write ${numQuestions} comprehension question(s) for each of the following content domains: ${domainList}.

Formatting and quality rules:
- Start each content domain group with a Markdown heading on its own line, written exactly as "## 2b – Retrieval" (a literal ## followed by a space, then the domain). Do not wrap the heading in ** or any other characters.
- Number questions sequentially within each group (1., 2., etc.)
- Questions must be clearly rooted in the passage — do not ask questions that cannot be answered from the text
- For inference and evaluation questions, phrase them to require evidence from the text (e.g. "Using evidence from the text, explain...")
- Allocate marks to each question in brackets, e.g. [2 marks] — align mark allocations with the complexity of the response required
- ${complexityInstruction}${questionTypeInstruction}

${answerKeyInstruction}${adaptationInstruction}`
      : `Using the passage below, create a reading comprehension activity for ${yearGroup} students following the ${curriculum}.

The questions should be at ${complexity.toLowerCase()} complexity level.

Write ${numQuestions} comprehension question(s) for each of the following content domains: ${domainList}.

Formatting and quality rules:
- Start each content domain group with a Markdown heading on its own line, written exactly as "## 2b – Retrieval" (a literal ## followed by a space, then the domain). Do not wrap the heading in ** or any other characters.
- Number questions sequentially within each group (1., 2., etc.)
- Questions must be clearly rooted in the passage — every question must be answerable from the text provided
- For inference and evaluation questions, phrase them to require evidence from the text (e.g. "Using evidence from the text, explain...")
- Allocate marks to each question in brackets, e.g. [2 marks] — align mark allocations with the complexity of the response required
- ${complexityInstruction}${questionTypeInstruction}

${answerKeyInstruction}${adaptationInstruction}

PASSAGE:
${ownText}`;

  return {
    messages: [
      { role: "system", content: buildSystem(SYSTEM) },
      { role: "user", content: userPrompt },
    ],
  };
}
