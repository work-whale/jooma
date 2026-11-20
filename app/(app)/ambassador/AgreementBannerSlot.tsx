import NewAgreementBanner from "@/app/components/ambassador/NewAgreementBanner";
import { loadAgreementState } from "./data";

/**
 * The new-agreement banner, loaded on its own. Render it inside <Suspense> so
 * the layout and page around it never wait on the agreement data: awaiting it
 * in the layout changed how the page streamed and left a second copy of the
 * page content in the DOM (seen in the inactivity and dashboard E2E).
 */
export default async function AgreementBannerSlot({ wrapClassName }: { wrapClassName?: string }) {
  const agreement = await loadAgreementState();
  if (!agreement.offer || !agreement.inForce) return null;
  const banner = <NewAgreementBanner onVersion={agreement.inForce.version} />;
  return wrapClassName ? (
    <div className={wrapClassName} style={{ paddingBottom: 0 }}>
      {banner}
    </div>
  ) : (
    banner
  );
}
