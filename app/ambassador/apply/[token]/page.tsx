import { redirect } from "next/navigation";

// Application links used to carry a single-use invite token. The programme now
// has one open link, so an old link goes there and is answered from the start:
// the landing page, the application, or "you have already applied".
export default function OldApplyLink() {
  redirect("/ambassador");
}
