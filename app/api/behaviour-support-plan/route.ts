import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { labModelFor } from "@/app/lib/model-lab";
import { requestLanguage } from "@/app/lib/languages";
import { behaviourRequest, type BehaviourPlanRequest } from "@/app/lib/behaviour-prompt";

/*
 * Streams a Behaviour Support Plan as JSON (app/lib/sheets/behaviour.ts),
 * which the form arranges into the familiar two-column plan.
 *
 * The child's name never reaches this route: the form sends "[PUPIL]" and
 * pronouns, and a request carrying a name field is refused. Editing the plan
 * afterwards is Jo's job (the old "refine" action resent the whole plan, name
 * and all, and is gone).
 */
export async function POST(req: NextRequest) {
  const body: BehaviourPlanRequest = await req.json();

  const built = behaviourRequest(body);
  if ("error" in built) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "behaviour-support-plan",
    ...(await labModelFor(body, "behaviour-support-plan", "gpt-4o")),
    max_completion_tokens: 8192,
    messages: built.messages,
    response_format: built.response_format,
  });
}
