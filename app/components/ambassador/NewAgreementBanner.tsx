import Link from "next/link";
import { AGREEMENT_VERSION } from "@/app/lib/ambassador-agreement";
import s from "./programme.module.css";

/**
 * Shown across the ambassador pages to anyone offered the current agreement in
 * place of an older one. Optional: the version they signed stays in force
 * until they accept.
 */
export default function NewAgreementBanner({ onVersion }: { onVersion: string }) {
  return (
    <div className={`${s.callout} ${s.calloutGold}`} data-testid="new-agreement-banner" style={{ marginBottom: 16 }}>
      <span>
        <b>We have updated the ambassador agreement to version {AGREEMENT_VERSION}.</b> Your rates are now fixed for
        the whole agreement, and there is a new clause saying your content is yours. You are on version {onVersion}{" "}
        until you accept.{" "}
        <Link href="/ambassador/agreement#accept" style={{ fontWeight: 600, textDecoration: "underline" }}>
          Read what changed and accept
        </Link>
      </span>
    </div>
  );
}
