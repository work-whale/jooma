import { redirect } from "next/navigation";

// Invite links used to carry a single-use token. The programme now has one open
// link (jooma.ai/ambassador), so any old link still out there goes to it.
export default function OldInviteLink() {
  redirect("/ambassador");
}
