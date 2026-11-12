import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { bandUsageStep } from "@/app/lib/differentiation";
import { confirmFollowOn } from "@/app/lib/follow-on-server";
import { requestLanguage } from "@/app/lib/languages";
import { homeworkRequest, type HomeworkRequest } from "@/app/lib/homework-prompt";

export type { HomeworkRequest };

/*
 * Streams a homework task as sheet JSON (app/lib/sheets/homework.ts): a pupil
 * page with instructions, a reminder, the task and a checklist, then the
 * answers. The prompt and the schema live in app/lib/homework-prompt.ts.
 *
 * An empty body gets a plain 400: the billing and sign-in tests post one here
 * to reach the gates in proxy.ts, which answer before this runs.
 */
export async function POST(req: NextRequest) {
  const body: HomeworkRequest = await req.json().catch(() => ({}) as HomeworkRequest);

  const built = homeworkRequest(body);
  if ("error" in built) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "homework-generator",
    step: await confirmFollowOn("homework-generator", bandUsageStep(body.band, body.bandIndex)),
    ...(await modelFor("homework-generator", "gpt-4o")),
    // JSON carries more tokens than the markdown it replaced.
    max_completion_tokens: 10000,
    messages: built.messages as Parameters<typeof streamChat>[0]["messages"],
    response_format: built.response_format,
  });
}
