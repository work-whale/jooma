import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { buildSystem } from "@/app/lib/systemPrompt";


const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function buildPrompt(
  curriculum: string,
  policy: string,
  additionalRequirements: string,
  outputType: "full" | "structure",
): string {
  const focusLine =
    outputType === "full"
      ? "Draft a complete, detailed school policy document with fully written sections. Each section must be substantive — not placeholder text. Reference relevant UK legislation, statutory guidance, or DfE frameworks where applicable."
      : "Draft a policy section structure only — provide numbered headings and sub-headings with a 2–3 sentence description of what each section should cover and, where relevant, which legislation or guidance it should reference. Do not write the full content.";

  const additionalLine = additionalRequirements.trim()
    ? `Additional requirements to incorporate: ${additionalRequirements}`
    : "";

  return `Create a professional school policy document for: "${policy}".

Curriculum context: ${curriculum}
${focusLine}
${additionalLine}

This policy is for a UK school. It must:
- Reflect current UK legislation, statutory guidance, and regulatory requirements relevant to this policy area. Where applicable, reference specific Acts of Parliament, DfE guidance documents, Ofsted frameworks, or other regulatory bodies (e.g. ICO for data protection, HSE for health and safety).
- Use accurate, professional language appropriate for a formal school governance document
- Be coherent and consistent in tone — written as though by an experienced school leader or governor, not assembled from generic templates
- Include all sections that would be expected in a high-quality, Ofsted-ready school policy of this type
- Be specific to a UK school setting — avoid generic international language

Format the document using markdown:
- Use # for the main policy title
- Immediately after the title, include a document info block formatted as a markdown list (using - ) like this:
  - **School Name:** [Insert School Name]
  - **Policy Category:** [relevant category]
  - **Date Adopted:** [Insert Date]
  - **Review Date:** [Insert Review Date, typically annually or biannually]
  - **Policy Owner:** [Insert Policy Owner — e.g. Headteacher, SENCO, DSL]
  - **Approved By:** [Insert Approving Body — e.g. Full Governing Body, Local Authority]
  - **Linked Policies:** [List 2–3 related policies this document should be read alongside]
- Follow the document info block with a --- separator
- Use ## for major section headings (e.g. ## 1.0 Introduction)
- Use ### for sub-section headings (e.g. ### 1.1 Purpose)
- Use bullet points (- ) for lists
- Use numbered lists (1. ) for procedural steps or sequential processes
- Use **bold** for key terms, legal references, and important labels
- Use --- to separate major sections

Do not use emojis.
Do not add any preamble — begin directly with the policy title.`;
}

function buildRefinePrompt(result: string, instruction: string): string {
  return `Modify the following school policy based on this instruction: "${instruction}"

Apply the changes precisely and consistently throughout the document. Where the instruction requires adding content, ensure the additions are specific, professional, and in keeping with UK school governance language. Where the instruction requires removing content, remove it cleanly without leaving orphaned references. Maintain the document's professional register, formatting, and any legislative references already present.

Current policy:
${result}

Return the full updated policy in the same markdown format. Apply only the changes described. Keep everything else as-is. No preamble — begin directly with the policy content.`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  if (action === "refine") {
    const { result, instruction } = body;
    if (!result?.trim() || !instruction?.trim()) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const openaiStream = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 8192,
      messages: [
        { role: "system", content: buildSystem("You are an expert UK school policy writer and school governor with comprehensive knowledge of UK education legislation, statutory guidance, and Ofsted requirements. Return only the updated policy in markdown format with no preamble or explanation.") },
        { role: "user", content: buildRefinePrompt(result, instruction) },
      ],
      stream: true,
    });

    const readable = new ReadableStream({
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
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" },
    });
  }

  // Default: generate
  const { curriculum, policy, additionalRequirements = "", outputType = "full" } = body;
  if (!curriculum?.trim() || !policy?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const openaiStream = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 8192,
    messages: [
      { role: "system", content: buildSystem("You are an expert UK school policy writer and governance specialist with comprehensive knowledge of UK education legislation, statutory DfE guidance, Ofsted's inspection framework, and best practice in school governance. You produce professional, legally accurate, and Ofsted-ready policy documents that would be credible in any UK school. Output only the policy document in markdown format. No preamble, no explanation, no code fences.") },
      { role: "user", content: buildPrompt(curriculum, policy, additionalRequirements, outputType) },
    ],
    stream: true,
  });

  const readable = new ReadableStream({
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
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" },
  });
}
