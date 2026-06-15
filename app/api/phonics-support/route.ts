import { NextRequest, NextResponse } from "next/server";
import { buildSystem } from "@/app/lib/systemPrompt";
import { streamChat } from "@/app/lib/usage";

export interface PhonicsSupportRequest {
  curriculum: string;
  age: number;
  grapheme: string;
}


export async function POST(req: NextRequest) {
  const body: PhonicsSupportRequest = await req.json();
  const { curriculum, age, grapheme } = body;

  if (!curriculum || !grapheme?.trim() || typeof age !== "number") {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const userPrompt = `Generate a comprehensive classroom phonics support resource for the following:

- Curriculum: ${curriculum}
- Age of pupils: ${age}
- Target grapheme/phoneme: '${grapheme}'

This resource is for use in an English primary school. It must be grounded in systematic synthetic phonics (SSP) principles as required by the National Curriculum and the DfE's guidance on teaching phonics. Grapheme-phoneme correspondences must be accurate. Word lists must be real, correctly spelled English words. Pseudo-words must be pronounceable and plausible but must not be real words.

Format the output exactly as follows (use markdown):

# Phonics Support: '${grapheme}'

## About This Grapheme

Write 2–3 sentences explaining: the phoneme this grapheme represents, any alternative pronunciations if applicable (e.g. 'ow' in "cow" vs "snow"), and which phonics phase or set this typically appears in (e.g. Phase 2, Phase 3, Phase 5 in Letters and Sounds / typical SSP programmes).

## Word Bank: '${grapheme}' Words by Complexity

**CVC Words:**

- [word]
(list 6–8 real words — only include if '${grapheme}' genuinely produces a CVC structure)

**CCVC Words:**

- [word]
(list 6–8 real words)

**CVCC Words:**

- [word]
(list 6–8 real words)

**CCVCC Words:**

- [word]
(list 4–6 real words)

**Two-Syllable Words:**

- [word]
(list 6–8 real words containing the '${grapheme}' grapheme)

**Multisyllabic Words:**

- [word]
(list 4–6 real words)

**Words with '${grapheme}' as a Single Sound:**

- [word]
(list 6–8 real words)

**Words with '${grapheme}' as Part of a Digraph:**

- [description and list, or "Not applicable for this grapheme." if none]

**Words with '${grapheme}' as Part of a Trigraph:**

- [description and list, or "Not applicable for this grapheme." if none]

## High-Frequency Words with '${grapheme}'

**Decodable High-Frequency Words** (words that follow phonics rules and can be decoded):

- [word]
(list 5–7 words drawn from common high-frequency word lists)

**Tricky / Common Exception Words** (words where '${grapheme}' is irregular or where the word cannot be fully decoded with taught GPCs):

- [word]
(list 2–4 words, or note "None identified for this grapheme." if none apply)

**Recommended Teaching Order:**

List 6–8 words in a recommended sequence from simplest to most complex. Mark any words that should be taught as whole-word sight words with "(sight word)".

1. [word]

## Decodable Text

**[Story Title — make it specific and engaging]**

Write a decodable story of 6–8 sentences appropriate for ${age}-year-old early readers. Requirements:
- The story must contain multiple natural occurrences of the '${grapheme}' grapheme throughout
- Vocabulary must be drawn predominantly from decodable words that ${age}-year-old pupils following ${curriculum} would have encountered
- The story must have a simple, coherent narrative — not a list of sentences
- Tricky words that cannot yet be decoded should be minimised and, where unavoidable, noted below the story in a "Tricky words in this text:" line

## Pseudo-Words Practice

List 8–10 pronounceable pseudo-words (also called nonsense words or alien words) using the '${grapheme}' grapheme. These are for use in phonics screening assessments and targeted practice. Each pseudo-word must:
- Be plausibly pronounceable using standard English phonics rules
- Contain the '${grapheme}' grapheme
- Not be a real English word

- [pseudo-word]

## Teaching Activities

### Activity 1: [Activity Title — name the phonics focus specifically]

**Focus:** [The precise phonics skill being practised — e.g. "Segmenting and blending CVC words containing '${grapheme}' for reading"]

**Materials:** [Specific, practical list of materials readily available in a UK primary school]

**Curriculum Link:** [Relevant National Curriculum or SSP programme objective]

**Procedure:**

1. [Detailed step — include teacher language/script cues where helpful]
2. [Step]
3. [Step]
4. [Step]
5. [Step — include a formative assessment checkpoint]

**Differentiation:**

- Support: [Specific adaptation for pupils who are not yet secure with the GPC — e.g. using phoneme frames, reducing word complexity]
- Challenge: [Specific extension for pupils who are secure — e.g. applying the GPC in sentence context, reading multisyllabic words]

### Activity 2: [Activity Title]

**Focus:** [Phonics skill]

**Materials:** [Specific materials]

**Curriculum Link:** [Objective]

**Procedure:**

1. [Step]
2. [Step]
3. [Step]
4. [Step]

**Differentiation:**

- Support: [Specific adaptation]
- Challenge: [Specific extension]

### Activity 3: [Activity Title]

**Focus:** [Phonics skill]

**Materials:** [Specific materials]

**Curriculum Link:** [Objective]

**Procedure:**

1. [Step]
2. [Step]
3. [Step]
4. [Step]

**Differentiation:**

- Support: [Specific adaptation]
- Challenge: [Specific extension]

### Activity 4: [Activity Title]

**Focus:** [Phonics skill]

**Materials:** [Specific materials]

**Curriculum Link:** [Objective]

**Procedure:**

1. [Step]
2. [Step]
3. [Step]
4. [Step]

**Differentiation:**

- Support: [Specific adaptation]
- Challenge: [Specific extension]

### Activity 5: [Activity Title]

**Focus:** [Phonics skill]

**Materials:** [Specific materials]

**Curriculum Link:** [Objective]

**Procedure:**

1. [Step]
2. [Step]
3. [Step]
4. [Step]

**Differentiation:**

- Support: [Specific adaptation]
- Challenge: [Specific extension]

## Common Misconceptions and Errors

For each, name the specific misconception and provide a precise teaching response:

- **[Misconception]:** [What the error looks like in practice and how to address it explicitly — include specific teacher language where helpful]
- **[Misconception]:** [As above]
- **[Misconception]:** [As above]
- **[Misconception]:** [As above]

## Assessment Ideas

- [Specific, practical assessment idea — describe how it works and what it reveals about the pupil's phonics understanding]
- [Assessment idea]
- [Assessment idea]
- [Assessment idea]

Rules:
- All content must be appropriate for ${age}-year-old pupils following the ${curriculum}.
- Word lists must contain only real, correctly spelled English words (except the pseudo-words section).
- Grapheme-phoneme information must be phonetically accurate.
- Do not use any emojis.
- Do not add any text before the main title or after the last assessment idea.`;

  return streamChat({
    toolSlug: "phonics-support",
    model: "gpt-4o",
    max_tokens: 8192,
    messages: [
      { role: "system", content: buildSystem("You are an expert UK phonics specialist, Reading Lead, and early years literacy teacher with in-depth knowledge of systematic synthetic phonics, the DfE's phonics guidance, the National Curriculum for English at KS1, and validated SSP programmes including Letters and Sounds and widely used systematic programmes. Your grapheme-phoneme knowledge is phonetically precise and accurate. Your word lists contain only correctly spelled, real English words (except designated pseudo-word sections). Your decodable texts are coherent, engaging, and genuinely aligned with the GPC being taught. Your teaching activities are practical, evidence-informed, and immediately usable in a UK primary classroom. You write in professional UK English.") },
      { role: "user", content: userPrompt },
    ],
  });
}
