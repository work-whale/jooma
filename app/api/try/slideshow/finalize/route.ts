// The guest deck, saved: once when it is built, then again as it is edited.
//
// /api/try/slideshow streams the deck and marks the run done; the browser
// assembles it with lib/deck-events (the same code the editor uses) and posts
// the result here so it can be claimed into the visitor's account later. The
// guest editor on /create then autosaves its edits here too, so what they claim
// is the deck as they left it, not as it was first generated.
//
// Accepted only for the guest who started the run, only after the server itself
// recorded that the run finished, only until it is claimed, and only for as
// long as "Your creations" on /create lists it (thirty days, the same as the
// guest cookie and the purge), so a deck reopened from there can still be
// edited. So the one thing a visitor can do with this is store their own deck,
// which is no more than they could put in their own account by hand after
// signing up. One row per run and three runs a day bound what any one visitor
// can write, and saves to one deck are spaced out (SAVE_GAP_MS) on the server,
// whatever the client's debounce says.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { readGuestId } from "@/app/lib/guest";
import { GUEST_MAX_AGE_S } from "@/app/lib/guest-cookie";
import type { SlideJSON } from "@/app/lib/presentations";

const MAX_BYTES = 6 * 1024 * 1024;
const MAX_SLIDES = 40;
const WINDOW_MS = GUEST_MAX_AGE_S * 1000;
const SAVE_GAP_MS = 2000;

export async function POST(req: Request) {
  const guestId = await readGuestId();
  if (!guestId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await req.text();
  if (raw.length > MAX_BYTES) {
    return NextResponse.json({ error: "That deck is too large to keep." }, { status: 413 });
  }

  let body: { id?: string; title?: string; slides?: SlideJSON[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const slides = body.slides;
  if (
    typeof body.id !== "string" ||
    !Array.isArray(slides) ||
    slides.length === 0 ||
    slides.length > MAX_SLIDES ||
    !slides.every((s) => s && typeof s === "object" && !Array.isArray(s))
  ) {
    return NextResponse.json({ error: "That is not a deck." }, { status: 400 });
  }

  const { data: row, error } = await supabaseAdmin
    .from("trial_generations")
    .select("id, guest_id, tool, status, output, created_at, title")
    .eq("id", body.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not save the deck." }, { status: 500 });

  const fresh = row && Date.now() - new Date(row.created_at as string).getTime() < WINDOW_MS;
  if (!row || row.guest_id !== guestId || row.tool !== "slideshow" || row.status !== "done" || !fresh) {
    return NextResponse.json({ error: "That deck cannot be saved." }, { status: 409 });
  }

  const savedAt = Number((row.output as { savedAt?: unknown } | null)?.savedAt);
  if (Number.isFinite(savedAt) && Date.now() - savedAt < SAVE_GAP_MS) {
    return NextResponse.json({ error: "Saving too often." }, { status: 429 });
  }

  const title =
    (typeof body.title === "string" && body.title.trim().slice(0, 200)) ||
    (row.title as string | null) ||
    "Untitled deck";

  // Conditional on the row still being done (not claimed mid request), and on
  // the save it last saw, so two racing saves cannot both write: the second
  // updates nothing and the next autosave carries the edit. The save stamp,
  // not the output itself, which is megabytes and would not fit in the query.
  let update = supabaseAdmin
    .from("trial_generations")
    .update({ output: { slides, savedAt: Date.now() }, title })
    .eq("id", row.id)
    .eq("status", "done");
  if (row.output === null) update = update.is("output", null);
  else if (Number.isFinite(savedAt)) update = update.eq("output->>savedAt", String(savedAt));
  else update = update.is("output->savedAt", null);
  const { data: updated, error: upErr } = await update.select("id");
  if (upErr) return NextResponse.json({ error: "Could not save the deck." }, { status: 500 });
  if (!updated?.length) {
    return NextResponse.json({ error: "That deck cannot be saved." }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
