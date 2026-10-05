// Move this browser's free tries into the signed in teacher's library.
//
// Called by GuestClaimer once there is a session and the guest flag cookie is
// set. Needs both: the session says whose library, the signed guest cookie
// says which work. A cookie that fails its signature claims nothing.
import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/auth/server";
import { clearGuestCookies, readGuestId } from "@/app/lib/guest";
import { claimGuestWork } from "@/app/lib/claimGuestWork";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const guestId = await readGuestId();
  if (!guestId) {
    await clearGuestCookies();
    return NextResponse.json({ claimed: [] });
  }

  const claimed = await claimGuestWork(user.id, guestId);
  // Cleared whether or not anything was claimed. The guest is now this teacher,
  // and an old cookie left behind would let a later visitor on the same
  // computer be treated as them.
  await clearGuestCookies();
  return NextResponse.json({ claimed });
}
