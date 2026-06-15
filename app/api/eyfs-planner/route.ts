import { NextRequest, NextResponse } from "next/server";
import { buildSystem } from "@/app/lib/systemPrompt";
import { streamChat } from "@/app/lib/usage";

export interface EYFSPlannerRequest {
  curriculum: string;
  topic: string;
  numberOfWeeks: number;
  includeBookList: boolean;
  includeHomeLearning: boolean;
  includeWeeklyOverview: boolean;
}


export async function POST(req: NextRequest) {
  const body: EYFSPlannerRequest = await req.json();

  const { curriculum, topic, numberOfWeeks, includeBookList, includeHomeLearning, includeWeeklyOverview } = body;

  if (!curriculum || !topic?.trim() || !numberOfWeeks) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const additionalSections: string[] = [];
  if (includeBookList) additionalSections.push("Book List");
  if (includeHomeLearning) additionalSections.push("Home Learning Ideas");
  if (includeWeeklyOverview) additionalSections.push("Weekly Overview");

  const additionalSection = additionalSections.length > 0
    ? `\n\nAfter all learning areas, also include the following additional sections: ${additionalSections.join(", ")}.`
    : "";

  const userPrompt = `Create a comprehensive Early Years Foundation Stage (EYFS) plan for the following:

- Curriculum: ${curriculum}
- Topic: ${topic}
- Number of Weeks: ${numberOfWeeks}

This plan is for use in an English Early Years setting (Nursery or Reception). All activities must be grounded in the EYFS Statutory Framework (2021) and aligned with the Early Learning Goals. The plan should reflect the EYFS pedagogical principles: learning through play, a balance of child-initiated and adult-led provision, and a rich enabling environment. Scale the breadth and number of activities so that the plan is realistic and sufficient to sustain approximately ${numberOfWeeks} week(s) of teaching.

Structure the output as follows:

# Early Years Plan: ${topic}

## Overview

Write a short paragraph (3–5 sentences) explaining how the topic "${topic}" will be woven through provision across the 7 areas of learning. Identify 2–3 ELGs that this topic is particularly well-suited to develop. Note any specific vocabulary focus, books, or real-world experiences that will enrich the provision.

## Learning Areas

Then for each of the 7 EYFS areas of learning below, create a full, detailed section:

1. Communication and Language
2. Physical Development
3. Personal, Social and Emotional Development
4. Literacy
5. Mathematics
6. Understanding the World
7. Expressive Arts and Design

For each learning area, use this exact structure:

## [Learning Area Name]

### Child-Initiated Learning and Continuous Provision

**Indoor:**

- **[Activity Name]:** [A specific, detailed description of the activity, how it relates to the topic, and how it promotes learning in this area. Include the practitioner's role in observing and extending learning.]
  - **Resources:** [Specific list of materials, books, or equipment needed]
  - **Key Vocabulary:** [4–6 carefully chosen words that adults should model and children are expected to encounter]
  - **Differentiation:** [Specific adaptations: one suggestion to extend more confident children, one to support less confident children or those with SEND]
  - **Learning Goal:** "[Quote the precise ELG statement this activity addresses]" (ELG: [Full ELG Name])

(Provide 2 distinct indoor continuous provision activities per learning area)

**Outdoor:**

- **[Activity Name]:** [Detailed description, topic link, and practitioner role]
  - **Resources:** [Specific list]
  - **Key Vocabulary:** [4–6 words]
  - **Differentiation:** [Two specific adaptations]
  - **Learning Goal:** "[ELG statement]" (ELG: [Full ELG Name])

(Provide 2 distinct outdoor continuous provision activities per learning area)

### Adult-Led Activities

- **[Activity Name]:** [A detailed description of the structured, adult-led activity including: what the adult does, what children are expected to do, how it develops the learning area, and how it connects to the topic. Include approximate duration.]
  - **Resources:** [Specific list]
  - **Key Vocabulary:** [4–6 words]
  - **Differentiation:** [Two specific adaptations — one for extension, one for support]
  - **Learning Goal:** "[ELG statement]" (ELG: [Full ELG Name])

(Provide 2 distinct adult-led activities per learning area)

All activities must be clearly, specifically linked to the topic "${topic}" — not just labelled with it. All ELG references must be accurate and drawn from the EYFS Statutory Framework (2021).${additionalSection}

Do not use any emojis. Write in a professional, practitioner-friendly tone appropriate for EYFS settings.`;

  return streamChat({
    toolSlug: "eyfs-planner",
    model: "gpt-4o",
    max_tokens: 8192,
    messages: [
      { role: "system", content: buildSystem("You are an expert Early Years Foundation Stage (EYFS) practitioner and curriculum leader with comprehensive knowledge of the EYFS Statutory Framework (2021), the Early Learning Goals, and best practice in child development. You design rich, purposeful provision that balances child-initiated play with adult-led learning across all seven areas of the EYFS. Your ELG references are always accurate and drawn directly from the 2021 framework. You understand the importance of the enabling environment, sustained shared thinking, and the key person approach. You write in professional UK English using EYFS-specific terminology.") },
      { role: "user", content: userPrompt },
    ],
  });
}
