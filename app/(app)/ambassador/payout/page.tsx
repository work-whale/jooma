import { redirect } from "next/navigation";
import { loadAmbassadorContext, loadDetails } from "../data";
import DetailsEditor from "./DetailsEditor";

// Payout details tab: where the money goes and who it goes to. Read through
// my_ambassador_details(), which returns only the last four digits of an
// account number; edits go through /api/ambassadors/details.
export const dynamic = "force-dynamic";

export default async function AmbassadorPayout() {
  const ctx = await loadAmbassadorContext();
  if (!ctx.ambassador) redirect("/ambassador");
  const details = await loadDetails();
  return <DetailsEditor details={details} />;
}
