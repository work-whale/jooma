import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { labModelFor } from "@/app/lib/model-lab";
import { requestLanguage } from "@/app/lib/languages";
import { pupilProfileRequest, type PupilProfileRequest } from "@/app/lib/pupil-profile-prompt";

/*
 * Streams a One Page Profile as JSON (app/lib/sheets/pupil-profile.ts), the
 * child's own voice in paired boxes under an empty photo frame.
 *
 * The child's name never reaches this route: the form sends "[PUPIL]" and
 * pronouns, and a request carrying a name field is refused. Editing is Jo's
 * job (the old "refine" action resent the whole profile, name and all).
 */
export async function POST(req: NextRequest) {
  const body: PupilProfileRequest = await req.json();

  const built = pupilProfileRequest(body);
  if ("error" in built) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  return streamChat({
    language: requestLanguage(body),
    toolSlug: "one-page-profile",
    ...(await labModelFor(body, "one-page-profile", "gpt-4o")),
    max_completion_tokens: 4096,
    messages: built.messages,
    response_format: built.response_format,
  });
}
