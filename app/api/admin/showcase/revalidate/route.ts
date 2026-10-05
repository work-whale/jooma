// Busts the cached "Made with Jooma" row after an admin approves, reorders or
// takes something down. Same arrangement as /api/admin/copy/revalidate: the
// review itself goes straight to Postgres (admin_review_showcase, which checks
// the permission), so Next never hears about it without this.
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/app/lib/auth/admin";
import { SHOWCASE_TAG } from "@/app/lib/showcase";

export async function POST() {
  await requireAdmin();
  // Expired now, not marked stale: an admin who approves a card and opens the
  // landing page expects to see it there, and with "max" that first visit is
  // served the old row. The query behind it is one small definer function.
  revalidateTag(SHOWCASE_TAG, { expire: 0 });
  return NextResponse.json({ ok: true });
}
