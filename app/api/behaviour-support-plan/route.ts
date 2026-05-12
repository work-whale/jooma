import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/app/lib/openai";
import { buildSystem } from "@/app/lib/systemPrompt";


function buildPrompt(body: {
  curriculum: string;
  yearGroup: string;
  studentName: string;
  studentGender: string;
  studentClass: string;
  supportNeeds: string;
  keyStaff: string;
  behaviourDescription: string;
  behaviouralTriggers: string;
  behaviouralPatterns: string;
  strengths: string;
  dislikes: string;
  previousInterventions: string;
  planStartDate: string;
  reviewDate: string;
}): string {
  const pronoun = body.studentGender === "Male" ? "he/him" : body.studentGender === "Female" ? "she/her" : "they/them";
  const subjectPronoun = body.studentGender === "Male" ? "He" : body.studentGender === "Female" ? "She" : "They";
  const possessivePronoun = body.studentGender === "Male" ? "his" : body.studentGender === "Female" ? "her" : "their";

  return `Create a detailed, evidence-informed Behaviour Support Plan for ${body.studentName} (${pronoun}), ${body.yearGroup}, ${body.studentClass || "class not specified"}.

This plan is for use in a UK school and should reflect best practice in positive behaviour support, consistent with the DfE's guidance on behaviour in schools and the SEND Code of Practice (2015) where the pupil has identified additional needs. The plan must be specific, practical, and immediately usable by all staff who work with ${body.studentName}.

Input data:
- Additional support needs: ${body.supportNeeds || "None specified"}
- Key staff: ${body.keyStaff || "[To be completed]"}
- Plan start date: ${body.planStartDate || "[Enter date]"}
- Review date: ${body.reviewDate || "[Enter date]"}
- Challenging behaviours: ${body.behaviourDescription}
- Triggers: ${body.behaviouralTriggers}
- Behavioural patterns/context: ${body.behaviouralPatterns || "Not specified"}
- Strengths and interests: ${body.strengths || "Not specified"}
- Dislikes: ${body.dislikes || "Not specified"}
- Previous interventions: ${body.previousInterventions || "None specified"}

Quality requirements:
- All strategies must be specific and actionable — not generic advice such as "praise good behaviour" but concrete, named actions
- Targets must be observable and measurable (e.g. "Complete 10 minutes of independent work before requesting support" rather than "improve focus")
- Reactive strategies must follow a clear de-escalation approach — avoiding language that could inflame the situation
- Phrases to use and avoid must be verbatim examples that any staff member could use immediately
- Rewards and motivators must be drawn from the pupil's known strengths and interests
- The plan must reflect knowledge of the specific triggers and patterns provided — not generic behaviour management advice

CRITICAL FORMATTING RULE: Each table cell must contain only a SINGLE line of text — no line breaks, no bullet lists, no <br> tags inside cells. Each bullet point must be its own separate table row.

Use ${body.studentName} throughout. Use ${possessivePronoun}/${subjectPronoun.toLowerCase()} pronouns.

Output the plan using these exact markdown tables:

---

| Behaviour Support Plan | |
|---|---|
| **Pupil name:** ${body.studentName} | **Class:** ${body.studentClass || "[Class]"} **Year Group:** ${body.yearGroup} |
| **Additional support needs:** ${body.supportNeeds || "[None specified]"} | |
| **Date plan starts:** ${body.planStartDate || "[Enter date]"} | **Staff working with the pupil:** ${body.keyStaff || "[Enter staff names]"} |
| **Date of next review:** ${body.reviewDate || "[Enter date]"} | |

---

| Challenging behaviour | Targets |
|---|---|
| **What does it look like?** | **What are we working towards?** |
| [ONE specific challenging behaviour] | [ONE specific measurable target] |
| [ONE specific challenging behaviour] | [ONE specific measurable target] |
| [ONE specific challenging behaviour] | [ONE specific measurable target] |
| [ONE specific challenging behaviour] | [ONE specific measurable target] |
| **What triggers it?** | **How do we get there?** |
| [ONE specific trigger] | [ONE specific strategy] |
| [ONE specific trigger] | [ONE specific strategy] |
| [ONE specific trigger] | [ONE specific strategy] |
| [ONE specific trigger] | [ONE specific strategy] |
| [ONE specific trigger] | [ONE specific strategy] |

---

| Strategies for positive behaviour | Early warning signs / Pro-active responses |
|---|---|
| **How do we maintain positive behaviour?** | **How do we prevent an incident?** |
| [ONE proactive strategy] | [ONE prevention strategy] |
| [ONE proactive strategy] | [ONE prevention strategy] |
| [ONE proactive strategy] | [ONE prevention strategy] |
| [ONE proactive strategy] | [ONE prevention strategy] |
| [ONE proactive strategy] | [ONE prevention strategy] |
| **Phrases to use** | **What to look out for** |
| [ONE specific phrase in quotes] | [ONE early warning sign] |
| [ONE specific phrase in quotes] | [ONE early warning sign] |
| [ONE specific phrase in quotes] | [ONE early warning sign] |
| [ONE specific phrase in quotes] | [ONE early warning sign] |
| **Rewards and motivators** | **How to respond (reminders, alternative environment)** |
| [ONE reward or motivator] | [ONE response strategy] |
| [ONE reward or motivator] | [ONE response strategy] |
| [ONE reward or motivator] | [ONE response strategy] |
| [ONE reward or motivator] | [ONE response strategy] |
| **Movement breaks** | **Distraction — what works?** |
| [ONE movement break idea] | [ONE distraction technique] |
| [ONE movement break idea] | [ONE distraction technique] |
| [ONE movement break idea] | [ONE distraction technique] |
| [ONE movement break idea] | [ONE distraction technique] |
| **What situations/times are likely to trigger a reaction?** | |
| [ONE high-risk situation or time] | |
| [ONE high-risk situation or time] | |
| [ONE high-risk situation or time] | |
| [ONE high-risk situation or time] | |

---

| Reactive strategies | Support after an incident |
|---|---|
| **How do we diffuse the situation?** | **How do we help the pupil reflect and learn?** |
| [ONE de-escalation strategy] | [ONE post-incident support step] |
| [ONE de-escalation strategy] | [ONE post-incident support step] |
| [ONE de-escalation strategy] | [ONE post-incident support step] |
| [ONE de-escalation strategy] | [ONE post-incident support step] |
| **What to do** | **Is there anything staff can learn about working with this pupil?** |
| [ONE thing to DO] | [ONE staff learning point] |
| [ONE thing NOT to do — prefix with "Don't:"] | [ONE staff learning point] |
| [ONE thing to DO] | [ONE staff learning point] |
| [ONE thing NOT to do — prefix with "Don't:"] | [ONE staff learning point] |
| **Phrases to use** | |
| [ONE specific phrase in quotes] | |
| [ONE specific phrase in quotes] | |
| [ONE specific phrase in quotes] | |
| **Calming techniques** | |
| [ONE calming technique] | |
| [ONE calming technique] | |
| [ONE calming technique] | |
| **At what stage should another member of staff be informed?** | |
| [Describe the escalation point and who to inform] | |

---

| Student strengths and interests | Dislikes |
|---|---|
| [2–3 sentence paragraph about strengths — single cell, no line breaks] | [2–3 sentence paragraph about dislikes — single cell, no line breaks] |

---

| Log of incidents | | | |
|---|---|---|---|
| **Date** | **Description of behaviour** | **Trigger for incident** | **Action taken** |
| [Leave empty for ongoing completion] | [Leave empty for ongoing completion] | [Leave empty for ongoing completion] | [Leave empty for ongoing completion] |
| [Leave empty for ongoing completion] | [Leave empty for ongoing completion] | [Leave empty for ongoing completion] | [Leave empty for ongoing completion] |
| [Leave empty for ongoing completion] | [Leave empty for ongoing completion] | [Leave empty for ongoing completion] | [Leave empty for ongoing completion] |

---

| BSP evaluation and next steps | |
|---|---|
| **How effective is the plan?** | |
| [ONE measurable success criterion] | |
| [ONE measurable success criterion] | |
| [ONE measurable success criterion] | |
| [ONE measurable success criterion] | |
| **Record suggestions to be considered when this plan is reviewed** | |
| [ONE review suggestion] | |
| [ONE review suggestion] | |
| [ONE review suggestion] | |
| [ONE review suggestion] | |

---

| Agreement | |
|---|---|
| Parent name ________________ | Staff name ________________ |
| Parent signature ________________ | Staff signature ________________ |
| Date ________________ | Date ________________ |

Output only the tables. No preamble, no explanation, no code fences. Every cell must be a single line.`;
}

function buildRefinePrompt(result: string, instruction: string): string {
  return `Modify the following Behaviour Support Plan based on this instruction: "${instruction}"

Apply the changes precisely. Where new strategies or targets are added, ensure they are specific, actionable, and consistent with positive behaviour support principles used in UK schools. Where content is removed or changed, ensure the plan remains coherent and usable.

Current plan:
${result}

CRITICAL: Each table cell must contain only a single line of text — no line breaks, no <br> tags, no bullet lists inside cells. Each point must be its own table row.

Return the full updated plan in the same markdown table format. Apply only the changes described. No preamble.`;
}

async function streamText(system: string, userContent: string) {
  const encoder = new TextEncoder();
  const openaiStream = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    max_tokens: 8192,
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
      buildSystem("You are an expert UK SENCO and positive behaviour support specialist with extensive experience writing Behaviour Support Plans in line with the SEND Code of Practice and DfE behaviour guidance. Return only the updated plan as markdown tables. Each cell must be a single line — no line breaks or <br> tags inside cells."),
      buildRefinePrompt(body.result, body.instruction),
    );
  }

  if (!body.curriculum?.trim() || !body.yearGroup?.trim() || !body.studentName?.trim() ||
      !body.behaviourDescription?.trim() || !body.behaviouralTriggers?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  return streamText(
    buildSystem("You are an expert UK SENCO, positive behaviour support specialist, and experienced secondary and primary school teacher with thorough knowledge of the SEND Code of Practice (2015), DfE guidance on behaviour in schools, and evidence-based de-escalation approaches. You create Behaviour Support Plans that are specific, practical, and immediately usable by all staff — not generic templates. Output only markdown tables. CRITICAL: every table cell must be a single line — no line breaks, no <br> tags, no multi-line content inside any cell. Each bullet point must be its own table row."),
    buildPrompt(body),
  );
}
