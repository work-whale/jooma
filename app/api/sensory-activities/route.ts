import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { buildSystem } from "@/app/lib/systemPrompt";

export interface SensoryActivitiesRequest {
  curriculum: string;
  yearGroup: string;
  subject: string;
  topic: string;
}


export async function POST(req: NextRequest) {
  const body: SensoryActivitiesRequest = await req.json();

  const { curriculum, yearGroup, subject, topic } = body;

  if (!curriculum || !yearGroup || !subject?.trim() || !topic?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const userPrompt = `Generate 5 high-quality multisensory learning activities for the following:

- Curriculum: ${curriculum}
- Year Group: ${yearGroup}
- Subject: ${subject}
- Topic: ${topic}

These activities are for use in a UK school and should support pupils with a range of learning needs, including those with SEND such as autism, sensory processing differences, and learning difficulties. Multisensory approaches are widely recognised — and endorsed by the SEND Code of Practice — as effective for deepening learning and improving retention across all pupils.

Each activity must:
- Be clearly and specifically connected to the topic "${topic}" and the subject "${subject}" — not just labelled with the topic but genuinely advancing curriculum learning through sensory engagement
- Be practically achievable in a UK school setting with realistic, readily available resources
- Deliberately engage at least 2–3 different senses in a purposeful, integrated way
- Be appropriate in challenge and engagement for ${yearGroup} pupils
- Include meaningful sensory adaptations that reflect an understanding of both sensory-seeking and sensory-sensitive learners

Across the 5 activities, ensure:
- A variety of senses are targeted (visual, auditory, tactile, kinaesthetic, olfactory/gustatory where safe and appropriate)
- A range of activity types (e.g. practical construction, movement-based, creative, investigative, verbal/oral)
- A mix of individual, paired, and group formats

Format the output exactly as follows:

# Sensory Activities: ${topic}

Then for each of the 5 activities use this exact structure:

## [Number]. [Specific Activity Title]

**Learning Objective:** [One specific sentence beginning with "Pupils will be able to..." that links this activity to the ${subject} curriculum for ${yearGroup}]

**Core Concepts:** [Comma-separated list of the specific subject concepts or knowledge this activity develops]

**Senses Targeted:**

- **[Sense]:** [A precise description of how this sense is engaged in the activity and why this sensory channel aids learning of this content]
- **[Sense]:** [As above]
- **[Sense]:** [As above — include a third sense where the activity genuinely engages one]

**Activity Description:**

[3–5 sentences providing a detailed, step-by-step description of the activity. Include: how it starts, what pupils do, what the teacher's role is, and how the sensory element is integral to the learning — not merely decorative.]

**Resources Required:**

- [Specific resource with any relevant quantity or specification]
- [Specific resource]
- [Specific resource]
- [Add further resources as needed]

**Sensory Adaptations:**

- **For sensory-sensitive pupils:** [A specific, practical adaptation that maintains access to the learning objective while reducing sensory overload — not a generic suggestion]
- **For sensory-seeking pupils:** [A specific, practical enhancement that channels sensory seeking into the learning activity]

**SEND and Inclusion Notes:** [1–2 sentences on how this activity supports any specific SEND needs (e.g. autism, dyslexia, DCD/dyspraxia) and how it can be adjusted for pupils with physical disabilities or EAL]

**Cross-Curricular Connections:** [2–3 connections to other subjects with a brief reason for each, e.g. "Mathematics (measurement and data recording); Science (materials and their properties)"]

---

Do not use any emojis. Do not add any text before the title or after the last activity.`;

  return streamChat({
    toolSlug: "sensory-activities",
    model: "gpt-4o",
    max_tokens: 8192,
    messages: [
      { role: "system", content: buildSystem("You are an expert UK SENCO, inclusion specialist, and classroom teacher with extensive experience designing multisensory learning activities for pupils across the SEND spectrum, including autism, dyslexia, sensory processing differences, and DCD. You understand the SEND Code of Practice and how multisensory approaches increase engagement, retention, and access for all learners. Your activities are always curriculum-aligned, practically achievable in a UK school, and genuinely informed by knowledge of sensory learning theory. You write in professional UK English.") },
      { role: "user", content: userPrompt },
    ],
  });
}
