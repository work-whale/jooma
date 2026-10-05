// The assistant (Jo) for signed in teachers.
//
// The turn itself lives in lib/assistant-pipeline, shared with the guest chat
// on /create. The plan gate and the spend ceiling are enforced in proxy.ts
// BEFORE this handler runs; see checkAssistantAccess and COST_BEARING_PATHS.
import { NextRequest } from "next/server";
import { runAssistantTurn, type AssistantBody } from "@/app/lib/assistant-pipeline";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as AssistantBody;
  return runAssistantTurn(body);
}
