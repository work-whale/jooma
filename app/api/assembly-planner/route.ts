import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { buildSystem } from "@/app/lib/systemPrompt";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { theme, stageOfSchool, lengthMinutes, additionalNotes } = body;

  if (!theme?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const duration = Number(lengthMinutes) || 20;

  const notesSection = additionalNotes?.trim()
    ? `\n- Additional notes: ${additionalNotes.trim()}`
    : "";

  const prompt = `You are an expert UK school leader and assembly specialist. Plan and script a complete assembly for the inputs below.

INPUTS:
- Theme: ${theme}
- Stage of school: ${stageOfSchool || "Primary"}
- Length: ${duration} minutes${notesSection}

Generate a complete Assembly Plan and Script using the structure below. No preamble, no explanation after the output.

# Assembly Script: [Descriptive title based on the theme]

## Overview and Timing Breakdown

List each section with its allocated time as bullet points. The times must add up exactly to ${duration} minutes. End with a **Total: ${duration} minutes** line.

Sections to include (adjust times proportionally to fill exactly ${duration} minutes):
- Introduction
- Main Message
- Story/Example
- Interactive Element
- Audience Questions
- Reflection/Call to Action

## Introduction ([X] minutes)

**Speaker Notes:**
[Script for the opening — greet the audience, introduce the theme with an engaging hook or question. Write as bullet points — each bullet is one thing the speaker says or does.]

**Delivery Notes:**
[3–4 practical tips for how to deliver this section well — tone, body language, pacing.]

## Main Message ([X] minutes)

**Speaker Notes:**
[Core content of the assembly — the key messages the audience should take away. Write as bullet points.]

**Delivery Notes:**
[3–4 practical delivery tips specific to this section.]

## Story/Example ([X] minutes)

**Speaker Notes:**
[A short, age-appropriate story or real-world example that illustrates the theme. Write as bullet points. If additional notes reference a specific theme or topic, weave it in here in a natural, relevant way.]

**Delivery Notes:**
[3–4 tips for storytelling delivery — voice, expression, audience engagement.]

## Interactive Element ([X] minutes)

**Speaker Notes:**
[A participatory activity or discussion prompt that involves the audience. Write as bullet points. Include differentiation for the stage of school.]

**Delivery Notes:**
[3–4 tips for managing participation and keeping the activity on track.]

## Audience Questions ([X] minutes)

**Speaker Notes:**
[4–5 discussion questions to pose to the audience, written as sub-bullets under a "Let's think together:" opener. Questions should be open-ended and age-appropriate.]

**Delivery Notes:**
[3–4 tips for facilitating responses and managing discussion.]

## Reflection/Call to Action ([X] minutes)

**Speaker Notes:**
[A closing reflection prompt and a clear call to action — one specific thing the audience can do. Write as bullet points.]

**Delivery Notes:**
[3 tips for the closing — tone, pace, ending on a positive note.]

## Required Resources

A bullet list of physical or digital resources needed to run this assembly. Include a preparation sub-list if relevant.

Be specific to the stage of school: ${stageOfSchool || "Primary"}. Use UK English throughout. Do not use emojis.`;

  const encoder = new TextEncoder();
  const openaiStream = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 4000,
    messages: [
      { role: "system", content: buildSystem("You are an expert UK school leader, PSHE specialist, and assembly writer with extensive experience planning and scripting whole-school assemblies for all phases. You write engaging, age-appropriate assembly scripts that are practical to deliver, curriculum-linked where relevant, and aligned with British values and safeguarding principles.") },
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
