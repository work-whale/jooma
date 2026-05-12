import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/app/lib/openai";
import { buildSystem } from "@/app/lib/systemPrompt";


function buildPrompt(body: {
  curriculum: string;
  yearGroup: string;
  activity: string;
  transport: string;
  location: string;
  resources: string;
}): string {
  const transportLine = body.transport.trim() ? `Mode of transport: ${body.transport}` : "";
  const locationLine = body.location.trim() ? `Location (if school based): ${body.location}` : "";
  const resourcesLine = body.resources.trim() ? `Resources/equipment involved: ${body.resources}` : "";

  return `Create a comprehensive, realistic risk assessment for the following school activity.

Year group: ${body.yearGroup}
Curriculum: ${body.curriculum}
Activity or trip: ${body.activity}
${transportLine}
${locationLine}
${resourcesLine}

This risk assessment is for a UK school and must comply with the principles of the Health and Safety at Work etc. Act 1974, the Management of Health and Safety at Work Regulations 1999, and relevant DfE and HSE guidance for educational settings. It must be specific to the activity described — not a generic template.

Generate a risk assessment table with at least 10–12 relevant, realistic hazards. Consider hazards across the full activity: preparation, travel (if applicable), the activity itself, and return. Think systematically about people (pupils, staff, visitors, members of the public), equipment, environment, and procedures.

Format the output as a markdown table with exactly these columns:
| Hazard | Potential Harm | Who/what might be harmed? | Likelihood of occurrence | Severity of harm | Risk Level | Existing Control Measures | Further Actions Required |

Column guidance:
- **Hazard**: Name the specific hazard precisely (e.g. "Slippery surfaces near the river bank" not "Outdoor hazard")
- **Potential Harm**: Describe the specific injury, illness, or adverse outcome that could result
- **Who/what might be harmed?**: Be specific — e.g. "Pupils with limited mobility", "Pupils with allergies", "Supervising staff", "Members of the public"
- **Likelihood of occurrence**: (1) Very Unlikely / (2) Unlikely / (3) Likely / (4) Very Likely
- **Severity of harm**: (1) Negligible / (2) Minor / (3) Moderate / (4) Major / (5) Catastrophic
- **Risk Level**: Calculate as Likelihood × Severity. Label as: Low (1–4) / Medium (5–9) / High (10–14) / Very High (15–25)
- **Existing Control Measures**: List the specific, practical measures already in place to reduce the risk. Be concrete — "adequate supervision" is not sufficient; name pupil-to-staff ratios, specific protocols, or equipment checks.
- **Further Actions Required**: Any additional actions needed before or during the activity to reduce risk to an acceptable level

Include at least one hazard specifically relevant to pupils with SEND or medical needs where applicable.
Make the risk assessment genuinely specific and realistic for a ${body.yearGroup} class undertaking: ${body.activity}.
Output only the markdown table — no title, no preamble, no explanation.`;
}

function buildRefinePrompt(result: string, instruction: string): string {
  return `Modify the following school risk assessment table based on this instruction: "${instruction}"

Apply the changes precisely and consistently. Where new hazards are added, ensure they are specific, realistic, and follow the same risk scoring methodology (Likelihood × Severity). Where control measures are revised, ensure they are practical and specific. Maintain compliance with UK health and safety principles throughout.

Current risk assessment:
${result}

Return the full updated risk assessment as a markdown table in the same format. Apply only the changes described. No preamble.`;
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
      buildSystem("You are an expert UK school health and safety officer with thorough knowledge of the Health and Safety at Work etc. Act 1974, the Management of Health and Safety at Work Regulations 1999, and DfE and HSE guidance for educational settings. Return only the updated risk assessment as a markdown table with no preamble."),
      buildRefinePrompt(body.result, body.instruction),
    );
  }

  if (!body.curriculum?.trim() || !body.yearGroup?.trim() || !body.activity?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  return streamText(
    buildSystem("You are an expert UK school health and safety officer and site manager with thorough knowledge of the Health and Safety at Work etc. Act 1974, the Management of Health and Safety at Work Regulations 1999, and DfE and HSE guidance for educational settings, including off-site visits and educational trips. You produce specific, realistic, and legally defensible risk assessments for all types of school activities. Output only a markdown table — no title, no preamble, no explanation."),
    buildPrompt(body),
  );
}
