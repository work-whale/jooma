// The guest deck, handed back once it is built.
//
// /api/try/slideshow streams the deck and marks the run done; the browser
// assembles it with lib/deck-events (the same code the editor uses) and posts
// the result here so it can be claimed into the visitor's account later.
//
// Accepted ONCE per run, only for the guest who started it, only after the
// server itself recorded that the run finished, and only within a couple of
// hours. So the one thing a visitor can do with this is store the deck they
// were just shown, which is no more than they could put in their own account
// by hand after signing up.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { readGuestId } from "@/app/lib/guest";
import type { SlideJSON } from "@/app/lib/presentations";

const MAX_BYTES = 6 * 1024 * 1024;
const MAX_SLIDES = 40;
const WINDOW_MS = 2 * 60 * 60 * 1000;

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
  if (
    !row ||
    row.guest_id !== guestId ||
    row.tool !== "slideshow" ||
    row.status !== "done" ||
    row.output !== null ||
    !fresh
  ) {
    return NextResponse.json({ error: "That deck cannot be saved." }, { status: 409 });
  }

  const title =
    (typeof body.title === "string" && body.title.trim().slice(0, 200)) ||
    (row.title as string | null) ||
    "Untitled deck";

  // Conditional on output still being null, so two racing posts cannot both
  // write: the second updates nothing.
  const { data: updated, error: upErr } = await supabaseAdmin
    .from("trial_generations")
    .update({ output: { slides }, title })
    .eq("id", row.id)
    .is("output", null)
    .select("id");
  if (upErr) return NextResponse.json({ error: "Could not save the deck." }, { status: 500 });
  if (!updated?.length) {
    return NextResponse.json({ error: "That deck cannot be saved." }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
