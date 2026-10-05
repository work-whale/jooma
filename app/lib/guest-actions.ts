// What a guest on /create pressed, and where signing up takes them afterwards.
//
// Every action on a guest's output (present, export, copy and so on) opens the
// sign up modal instead. The action is remembered, and once the work has been
// claimed into the new account the teacher is taken straight to it with
// `?then=` set, so the thing they asked for happens without a second click.
// Pure, for tests/unit. No dashes or the word for machine intelligence in any
// string: these are shown on the signed out surface.

export type GuestKind = "slides" | "comprehension";

export type GuestAction =
  | "present"
  | "export"
  | "edit"
  | "theme"
  | "share"
  | "regenerate"
  | "copy"
  | "print"
  | "focus"
  | "more";

/** The `?then=` values the app understands, each a `[data-then]` button. */
export type ThenAction = "present" | "export" | "copy" | "focus";

export const PENDING_ACTION_KEY = "jooma:pending-action";

export interface PendingAction {
  action: GuestAction;
  kind: GuestKind;
  at: number;
}

/** A remembered action older than this is ignored. */
export const PENDING_ACTION_TTL_MS = 2 * 24 * 60 * 60 * 1000;

export function thenFor(kind: GuestKind, action: GuestAction | null | undefined): ThenAction | null {
  if (!action) return null;
  if (kind === "slides") {
    if (action === "present") return "present";
    if (action === "export") return "export";
    return null;
  }
  if (action === "export" || action === "print") return "export";
  if (action === "copy") return "copy";
  if (action === "focus") return "focus";
  return null;
}

export function isThenAction(v: string | null | undefined): v is ThenAction {
  return v === "present" || v === "export" || v === "copy" || v === "focus";
}

/** The modal's heading, written for the thing they just tried to do. */
export function gateTitle(kind: GuestKind, action: GuestAction | null): string {
  const what = kind === "slides" ? "deck" : "comprehension";
  switch (action) {
    case "present":
      return "Sign up for free to present your deck";
    case "export":
    case "print":
      return `Sign up for free to export your ${what}`;
    case "copy":
      return `Sign up for free to copy your ${what}`;
    case "edit":
    case "theme":
    case "regenerate":
      return `Sign up for free to edit your ${what}`;
    case "share":
      return `Sign up for free to share your ${what}`;
    case "more":
      return "Sign up for free to keep making";
    default:
      return `Sign up for free to keep your ${what}`;
  }
}

export interface ClaimedLike {
  kind: GuestKind;
  id: string;
}

/**
 * Where to go once guest work has been claimed. One item opens it, with the
 * remembered action if it was for the same kind of thing. Several go to the
 * library, which is where all of them now are. Nothing claimed, nowhere.
 */
export function claimDestination(
  claimed: ClaimedLike[],
  pending: PendingAction | null,
  now = Date.now(),
): string | null {
  if (claimed.length === 0) return null;
  if (claimed.length > 1) return `/folders?claimed=${claimed.length}`;

  const item = claimed[0];
  const live = pending && now - pending.at < PENDING_ACTION_TTL_MS && pending.kind === item.kind;
  const then = live ? thenFor(item.kind, pending.action) : null;

  // fresh=1 tells the page this arrived from a free try, so it offers the
  // "share on the homepage" prompt the way a fresh generation would.
  const params = new URLSearchParams();
  if (item.kind !== "slides") params.set("run", item.id);
  if (then) params.set("then", then);
  params.set("fresh", "1");
  if (item.kind === "slides") {
    return `/editor/${encodeURIComponent(item.id)}?${params.toString()}`;
  }
  return `/tools/comprehension-generator?${params.toString()}`;
}

/** Read the remembered action, tolerating anything odd in storage. */
export function parsePendingAction(raw: string | null): PendingAction | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<PendingAction>;
    if (
      typeof v.action === "string" &&
      (v.kind === "slides" || v.kind === "comprehension") &&
      typeof v.at === "number"
    ) {
      return { action: v.action as GuestAction, kind: v.kind, at: v.at };
    }
  } catch {
    // Not ours, or corrupted. Treated as nothing remembered.
  }
  return null;
}
