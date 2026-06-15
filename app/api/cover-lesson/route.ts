import { NextRequest, NextResponse } from "next/server";
import { buildSystem } from "@/app/lib/systemPrompt";
import { streamChat } from "@/app/lib/usage";

export interface CoverLessonRequest {
  curriculum: string;
  yearGroup: string;
  subject: string;
  topic: string;
  lessonLength: string;
  resources: string;
  additionalContext?: string;
}


export async function POST(req: NextRequest) {
  const body: CoverLessonRequest = await req.json();

  const { curriculum, yearGroup, subject, topic, lessonLength, resources, additionalContext } = body;

  if (!curriculum || !yearGroup || !subject?.trim() || !topic?.trim() || !lessonLength || !resources) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const contextSection = additionalContext?.trim()
    ? `\nAdditional context from the teacher: ${additionalContext.trim()}`
    : "";

  const userPrompt = `Create a complete, self-contained cover lesson for the following:

- Curriculum: ${curriculum}
- Year Group: ${yearGroup}
- Subject: ${subject}
- Topic the class is currently studying: ${topic}
- Lesson length: ${lessonLength}
- Resources available: ${resources}${contextSection}

This cover lesson must be deliverable by a non-specialist cover teacher with NO prior knowledge of the subject. Every instruction must be explicit, clear, and require zero preparation. The cover teacher should be able to pick this up and walk into the room.

Format using markdown as follows:

# Cover Lesson: ${subject} — ${topic}

**Year Group:** ${yearGroup} | **Subject:** ${subject} | **Length:** ${lessonLength}
**Resources needed:** ${resources}

---

## Cover Teacher Notes

Write 3–5 bullet points of essential information for the cover teacher before they enter the room. Include: what to expect from this class, how to set the room up, what pupils should already know about this topic, and any key classroom management tips. Keep it brief and reassuring.

---

## Lesson at a Glance

Provide a simple timed overview of the lesson in a table with columns: **Time**, **Activity**, **What the cover teacher does**.

---

## Starter Activity — [give it a short engaging title] (~[X] minutes)

**What to say to the class:**
Write the exact words the cover teacher can say to introduce the activity, in quotation marks. Keep it natural.

**The activity:**
Describe the starter activity in step-by-step instructions. It should require no resources beyond what is listed, take no more than 10 minutes, and require no subject expertise to run. Examples: a discussion prompt on the board, a true/false quiz read aloud, a recall challenge.

**If pupils finish early:** [one sentence]

---

## Main Activity — [give it a short engaging title] (~[X] minutes)

**What to say to the class:**
Write the exact words the cover teacher can say to introduce the activity.

**Step-by-step instructions for the cover teacher:**
Number each step clearly. Include what to write on the board, how to explain the task, how to manage the class during the activity, and what a successful outcome looks like.

**The task (pupil-facing):**
Write the task instructions exactly as pupils should see them — clearly formatted so the cover teacher can simply read or copy them onto the board, or display them. Include 4–8 questions or tasks as appropriate for the lesson length and year group.

**If pupils finish early:** [a meaningful extension, not just "read your notes"]

---

## Plenary — [give it a short title] (~[X] minutes)

**What to say to the class:**
Write the exact words to use.

**The activity:**
A brief, low-effort closing activity that brings the class back together. Examples: 3-2-1 reflection, class discussion question, exit ticket, quick vote. Step-by-step instructions for the cover teacher.

---

## End of Lesson Checklist

Provide 4–5 bullet points for the cover teacher to action before leaving the room — e.g. collect work, note any issues, tidy up, fill in cover report.

- [ ] ...
- [ ] ...

Ensure the total timing adds up to ${lessonLength}. Write in a warm, professional tone that makes the cover teacher feel confident.`;

  return streamChat({
    toolSlug: "cover-lesson",
    model: "gpt-4o",
    max_tokens: 4096,
    messages: [
      { role: "system", content: buildSystem(`You are an expert UK teacher with extensive experience writing cover lessons that any non-specialist can deliver confidently. You write in clear, friendly, step-by-step language. Your cover lessons are fully self-contained — no preparation required, no subject knowledge assumed. You are precise about timings, explicit about instructions, and always include word-for-word scripts where helpful. You write in professional UK English.`) },
      { role: "user", content: userPrompt },
    ],
  });
}
