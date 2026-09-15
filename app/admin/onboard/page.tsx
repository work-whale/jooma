import { requireSection } from "../access";
import NotBuiltBanner from "../NotBuiltBanner";
import OnboardWizard, { type TrustOption } from "./OnboardWizard";

export const dynamic = "force-dynamic";

export default async function AdminOnboardPage() {
  const { supabase } = await requireSection("see_people");
  const { data: trusts } = await supabase.rpc("admin_trusts");

  return (
    <>
      <NotBuiltBanner>
        School onboarding isn&apos;t live — there&apos;s no School pricing, no
        seat model, and no billing path behind this wizard. Use it to model a
        deal, not to sign one.
      </NotBuiltBanner>
      <OnboardWizard trusts={(trusts ?? []) as TrustOption[]} />
    </>
  );
}
