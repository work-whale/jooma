import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { buildSystem } from "@/app/lib/systemPrompt";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { purpose, duration, participants, topics, includeIcebreaker, includeActionItems } = body;

  if (!purpose?.trim() || !duration || !participants?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const icebreakerSection = includeIcebreaker
    ? `\n\n### Opening Activity (5 minutes)

**Type:** [A specific, appropriate icebreaker activity for this group and purpose]
**Purpose:** [Why this icebreaker suits this meeting]
**Implementation:** [Exactly how to run it — step by step]`
    : "";

  const actionItemsSection = includeActionItems
    ? `\n\n## Action Items

| Action Item | Assigned To | Deadline |
|---|---|---|
| [Specific action 1] | [Name of responsible person] | [Completion date] |
| [Specific action 2] | [Name of responsible person] | [Completion date] |
| [Specific action 3] | [Name of responsible person] | [Completion date] |
| [Specific action 4] | [Name of responsible person] | [Completion date] |
| [Specific action 5] | [Name of responsible person] | [Completion date] |`
    : "";

  const topicsLine = topics?.trim()
    ? `Topics to cover: ${topics}`
    : "";

  const prompt = `You are a professional meeting facilitator helping a UK school plan a structured, productive meeting. Generate a detailed meeting plan based on the following inputs.

INPUTS:
- Meeting purpose: ${purpose}
- Duration: ${duration} minutes
- Participants: ${participants}
${topicsLine ? `- ${topicsLine}` : ""}

Generate a complete meeting plan using the following structure. Use proper markdown. Do not use emojis.

# Detailed Meeting Plan

## Meeting Overview

**Purpose:** ${purpose}
**Duration:** ${duration} minutes
**Participants:** ${participants}

## Facilitation Guide

### Pre-Meeting Preparation (Facilitator Tasks)

List 4 specific preparation tasks for the facilitator before the meeting. Use the format: **Task name:** description. Cover room setup, materials, advance distribution, and facilitator preparation.
${icebreakerSection}

### Opening and Context Setting (5 minutes)

**Opening approach:** [How to open the meeting — specific and practical]
**Purpose clarification:** [How to state the meeting goals clearly]
**Expectations setting:** [How to set the tone and ground rules]

### Discussion Structure

Divide the remaining time across the topics to cover. For each topic, write a numbered section using this format:

### [Number]. [Topic Name] ([X] minutes)

**Discussion purpose:** [What this segment aims to achieve]
**Presentation approach:** [How the topic will be introduced or presented]
**Key discussion points:** [2–3 specific points to cover]
**Facilitation guidance:** [How to facilitate the discussion — specific techniques]
**Desired outcome:** [What should be agreed, decided, or produced by the end of this segment]
${actionItemsSection}

### Closing and Next Steps (5 minutes)

**Summary approach:** [How to summarise key points and decisions]
**Action confirmation:** [How to confirm assigned actions and deadlines]
**Forward planning:** [How to agree on follow-up]
**Closing remarks:** [How to close the meeting positively]

## Follow-up Plan

**Documentation:** [How meeting notes will be recorded and shared]
**Action tracking:** [How agreed actions will be monitored]
**Impact assessment:** [How the effectiveness of the meeting will be evaluated]
**Continuous improvement:** [How feedback will be gathered for future meetings]

---

## Meeting Agenda

### Basic Information

- **Date:** [To be completed]
- **Time:** [To be completed]
- **Location:** [To be completed]
- **Duration:** ${duration} minutes
- **Facilitator:** [To be completed]

### Meeting Purpose

${purpose}

### Agenda Items

Write a numbered list of agenda items with timings, matching the discussion structure above.

Make every section specific to the meeting purpose and participants provided — avoid generic filler. The plan should be practical enough to pick up and use directly.`;

  const encoder = new TextEncoder();
  const openaiStream = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 3000,
    messages: [
      { role: "system", content: buildSystem("You are an expert facilitator and school leader with extensive experience designing and running productive professional meetings in UK schools. You create structured, time-efficient meeting plans that respect participants' time, drive clear outcomes, and follow best practice for collaborative professional dialogue.") },
      { role: "user", content: prompt },
    ],
    stream: true,
  });

  const readableStream = new ReadableStream({
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
    cancel() {
      openaiStream.controller.abort();
    },
  });

  return new NextResponse(readableStream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
