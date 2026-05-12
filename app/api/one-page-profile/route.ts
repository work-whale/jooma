import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/app/lib/openai";
import { buildSystem } from "@/app/lib/systemPrompt";


function buildPrompt(body: {
  curriculum: string;
  yearGroup: string;
  name: string;
  likes: string;
  happy: string;
  supportNeeds: string;
  supportStyle: string;
  hopes: string;
  interventionGroups: string;
  outsideAgency: string;
  includeAdditionalSupport: boolean;
}): string {
  const additionalSupportLine = body.includeAdditionalSupport
    ? `Under "How I Would Like to Be Supported", include two subsections:
  - **Essential Strategies (based on student input):** strategies drawn directly from the student's notes
  - **Additional Recommended Strategies (based on professional input):** evidence-based strategies a teacher or SENCO might add, and a "Curriculum Accommodations" bullet list relevant to the year group`
    : `Under "How I Would Like to Be Supported", write strategies drawn directly from the student's notes only.`;

  const interventionLine = body.interventionGroups.trim()
    ? `Intervention Groups: ${body.interventionGroups}`
    : "Intervention Groups: [Information about any intervention groups can be included here if applicable.]";

  const outsideLine = body.outsideAgency.trim()
    ? `Outside Agency Input: ${body.outsideAgency}`
    : "Outside Agency Input: [Information about any outside agency support can be included here if applicable.]";

  return `Create a one-page pupil support profile for ${body.name}, following the person-centred planning principles outlined in the SEND Code of Practice (2015).

The profile must be written entirely in the FIRST PERSON from the pupil's perspective — using "I", "me", and "my" throughout. The input notes below are written in the third person by a teacher or SENCO; your role is to transform them into the pupil's authentic voice, as though the pupil themselves is speaking.

Year group: ${body.yearGroup}
Curriculum: ${body.curriculum}

Input notes (third-person — to be rewritten as first-person):
- What people like and admire about this pupil: ${body.likes}
- What makes this pupil happy: ${body.happy}
- What this pupil needs support with: ${body.supportNeeds}
- How this pupil likes to be supported: ${body.supportStyle}
- This pupil's hopes and wishes for the future: ${body.hopes}

Writing guidance:
- Use warm, natural, age-appropriate language that genuinely sounds like it could have been written by a ${body.yearGroup} pupil — not clinical, bureaucratic, or adult-dominated
- Be specific and personal — draw on the details provided in the notes; avoid generic statements that could apply to any pupil
- Each section should feel like a genuine, individual expression of this pupil's identity, preferences, and needs
- The overall profile should feel empowering and strengths-focused while being honest about the support required

Format using markdown:

# ${body.name}'s Support Profile

**${body.yearGroup} | Review Date: [ENTER DATE] | Last Updated: [ENTER DATE]**

*This profile was created collaboratively with ${body.name}, ${body.name}'s parents or carers, and teaching staff.*

---

## What People Like and Admire About Me

[3–4 natural, specific sentences in first person. Include concrete details from the input — e.g. specific interests, qualities, or achievements people have noticed. Avoid hollow generic phrases like "I am a kind person".]

---

## What Makes Me Happy

[3–4 sentences in first person. Be specific about activities, environments, people, or moments that bring joy or comfort. This section should give teachers a vivid, human picture of what motivates and engages this pupil.]

---

## What I Need Support With

[3–4 sentences in first person. Be honest and specific about the areas where the pupil needs help, using language the pupil would recognise and accept. Frame needs as normal and manageable — not deficits.]

---

## How I Would Like to Be Supported

${additionalSupportLine}

---

## My Hopes and Wishes for the Future

[3–4 sentences in first person. Capture the pupil's genuine aspirations — both near-term (e.g. "I want to be able to read chapter books by myself") and longer-term (e.g. career or life hopes). Be specific to the individual.]

---

## Links to Additional Support

- **Intervention Groups:** ${interventionLine}
- **Outside Agency Input:** ${outsideLine}

Do not include any preamble — begin directly with the profile title.`;

}

function buildRefinePrompt(result: string, instruction: string): string {
  return `Modify the following one-page pupil support profile based on this instruction: "${instruction}"

Apply the changes precisely while maintaining the profile's first-person voice, warm tone, and person-centred approach. Ensure any new content sounds authentically like the pupil's own voice, not an adult's clinical description. Keep everything not specified in the instruction exactly as it is.

Current profile:
${result}

Return the full updated profile in the same markdown format. No preamble.`;
}

async function streamText(system: string, userContent: string) {
  const encoder = new TextEncoder();
  const openaiStream = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    max_tokens: 4096,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
    stream: true,
  });

  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of openaiStream) {
            const text = chunk.choices[0]?.delta?.content ?? "";
            if (text) controller.enqueue(encoder.encode(text));
          }
        } catch (err) {
          controller.error(err);
        } finally {
          controller.close();
        }
      },
      cancel() { openaiStream.controller.abort(); },
    }),
    { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" } },
  );
}

export async function POST(req: NextRequest) {
  const client = getOpenAI();
  const body = await req.json();

  if (body.action === "refine") {
    if (!body.result?.trim() || !body.instruction?.trim()) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    return streamText(
      buildSystem("You are an expert UK SENCO and person-centred planning specialist with deep knowledge of the SEND Code of Practice (2015) and one-page profile best practice. Return only the updated profile in markdown format with no preamble."),
      buildRefinePrompt(body.result, body.instruction),
    );
  }

  if (!body.name?.trim() || !body.yearGroup?.trim() || !body.curriculum?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  return streamText(
    buildSystem("You are an expert UK SENCO, inclusion specialist, and person-centred planning practitioner with deep knowledge of the SEND Code of Practice (2015) and extensive experience creating one-page profiles that give pupils genuine voice and ownership. You write with warmth, authenticity, and specificity — transforming third-person teacher notes into first-person pupil narratives that feel real and empowering. Output only the profile in markdown format. No preamble, no explanation, no code fences."),
    buildPrompt(body),
  );
}
