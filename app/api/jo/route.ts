// Jo editing a teacher's resource in place.
//
// The turn lives in lib/jo/pipeline, shared with the free try route. The plan
// gate and the spend ceiling are enforced in proxy.ts BEFORE this handler
// runs; see isAssistantRequest and COST_BEARING_PATHS.
import { NextRequest, NextResponse } from "next/server";
import { runJoTurn } from "@/app/lib/jo/pipeline";
import type { JoTurnBody } from "@/app/lib/jo/types";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let body: JoTurnBody;
  try {
    body = (await req.json()) as JoTurnBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  return runJoTurn(body);
}
