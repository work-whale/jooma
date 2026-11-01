// Move this browser's free tries into the signed in teacher's library.
//
// Called by GuestClaimer once there is a session and the guest flag cookie is
// set. Needs both: the session says whose library, the signed guest cookie
// says which work. A cookie that fails its signature claims nothing.
//
// NOTHING MOVES WHILE THE ACCOUNT IS LOCKED. What is in the library can be
// exported by anyone who has ever paid, so work made on the free tools would be a
// way round their export lock. It waits under guest_id = user id, and the Stripe
// webhook claims it when a subscription starts. The cookie is left alone so the
// tries made while signed out come across at the same moment.
import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/auth/server";
import { clearGuestCookies, readGuestId, trialAccount } from "@/app/lib/guest";
import { claimGuestWork } from "@/app/lib/claimGuestWork";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await trialAccount();
  if (account?.locked) return NextResponse.json({ claimed: [] });

  // Their own, from when they were locked, needs no cookie. The Stripe webhook
  // normally got here first; a comp from an admin has no other way in.
  const guestId = await readGuestId();
  const claimed = [
    ...(guestId ? await claimGuestWork(user.id, guestId) : []),
    ...(await claimGuestWork(user.id, user.id)),
  ];
  // Cleared whether or not anything was claimed. The guest is now this teacher,
  // and an old cookie left behind would let a later visitor on the same
  // computer be treated as them.
  await clearGuestCookies();
  return NextResponse.json({ claimed });
}
