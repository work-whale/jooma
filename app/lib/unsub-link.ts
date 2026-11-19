/*
 * Signed one-click unsubscribe links for the lifecycle marketing emails (Jooma
 * 4.5 Step 6: E9a, E9b, E10).
 *
 * Bulk broadcasts store a uuid token per recipient row (email_campaign_
 * recipients.unsub_token). Lifecycle emails have no such row, so their link is
 * signed instead: "u1.<user id>.<HMAC>". Nothing is stored, so no migration.
 * The signature is the credential: it can only be made with the server secret
 * and it names exactly one teacher.
 *
 * The "u1." prefix keeps it apart from a broadcast's bare uuid in the shared
 * /api/email/unsubscribe route, and leaves room for a v2 if the secret moves.
 *
 * Pure apart from node:crypto, so tests/unit/unsub-link.spec.ts pins it.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PREFIX = "u1";
/** 128 bits of HMAC-SHA256, base64url: 22 characters. */
const SIG_LEN = 22;

function sign(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(`unsubscribe:${PREFIX}:${userId}`).digest("base64url").slice(0, SIG_LEN);
}

export function signUnsubToken(userId: string, secret: string): string {
  if (!secret) throw new Error("No unsubscribe secret");
  const id = userId.toLowerCase();
  if (!UUID_RE.test(id)) throw new Error("Unsubscribe token needs a user id");
  return `${PREFIX}.${id}.${sign(id, secret)}`;
}

/** The teacher the token names, or null for anything that is not a valid,
 *  correctly signed teacher token. Never throws. */
export function verifyUnsubToken(token: string, secret: string): string | null {
  if (!secret || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const id = parts[1].toLowerCase();
  const sig = parts[2];
  if (!UUID_RE.test(id) || sig.length !== SIG_LEN) return null;
  const want = Buffer.from(sign(id, secret));
  const got = Buffer.from(sig);
  if (want.length !== got.length) return null;
  return timingSafeEqual(want, got) ? id : null;
}

export function isTeacherToken(token: string): boolean {
  return typeof token === "string" && token.startsWith(`${PREFIX}.`);
}

/**
 * The signing secret. UNSUB_SECRET when set; otherwise one derived from the
 * service role key, which every server already has, so links work with no new
 * environment variable. Derived (hashed with a label), never the raw key, so a
 * leaked signature says nothing about the key. Rotating the service key breaks
 * old links, which only means an old email's link shows "not valid"; email
 * settings still work.
 */
export function unsubSecret(env: Record<string, string | undefined>): string | null {
  const own = env.UNSUB_SECRET?.trim();
  if (own) return own;
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) return null;
  return createHash("sha256").update(`jooma-unsubscribe-v1:${key}`).digest("base64url");
}
