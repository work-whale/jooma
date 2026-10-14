import Link from "next/link";
import { FileText, HourglassMedium, SquaresFour, XCircle } from "@phosphor-icons/react/dist/ssr";
import s from "./programme.module.css";

/**
 * What an applicant sees between applying and being approved, or after being
 * declined. Shown straight after they sign, and again on /ambassador (which the
 * account menu links to while they wait).
 */
export default function ApplicationStatus({
  status,
  firstName,
  submittedAt,
  declineReason,
}: {
  status: "pending" | "declined";
  firstName?: string | null;
  submittedAt?: string | null;
  declineReason?: string | null;
}) {
  if (status === "declined") {
    return (
      <div className={`${s.wrap} ${s.narrow}`} data-testid="application-declined">
        <div className={s.statebox}>
          <span className={`${s.stateIc} ${s.stateIcGrey}`}>
            <XCircle size={32} weight="fill" />
          </span>
          <h1 className={s.h1}>Not this time{firstName ? `, ${firstName}` : ""}.</h1>
          <p>
            Thank you for applying to the Jooma Ambassador Programme. We are keeping it small for
            now, and we are not able to offer you a place at the moment.
          </p>
          {declineReason && (
            <p style={{ marginTop: 12 }}>
              <i>&ldquo;{declineReason}&rdquo;</i>
            </p>
          )}
        </div>
        <div className={s.card}>
          <div className={s.rowline}>
            <span className={s.rowIcon} style={{ background: "var(--j-purple)" }}>
              <SquaresFour size={17} weight="fill" />
            </span>
            <span className={s.rowMain}>
              <b>Your Jooma account is unchanged</b>
              <span>Your plan and library are exactly as they were.</span>
            </span>
            <span className={s.rowRight}>
              <Link href="/dashboard" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}>
                Open Jooma
              </Link>
            </span>
          </div>
        </div>
        <ContactLine />
      </div>
    );
  }

  const sent = submittedAt
    ? new Date(submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div className={`${s.wrap} ${s.narrow}`} data-testid="application-under-review">
      <div className={s.statebox}>
        <span className={s.stateIc}>
          <HourglassMedium size={32} weight="fill" />
        </span>
        <h1 className={s.h1}>That is with us.</h1>
        <p>
          We read every application properly, so give us a couple of working days. Nothing else is
          needed from you.
        </p>
      </div>

      <div className={s.card}>
        <h2 className={s.h2}>What happens now</h2>
        <div className={s.tl}>
          <div className={s.tlNow}>
            <b>{sent ? `${sent}: sent for review` : "Sent for review"}</b>
            <span>
              Your application and signed agreement are with us. A confirmation with what you
              signed is on its way to your inbox.
            </span>
          </div>
          <div>
            <b>Within two working days: we decide</b>
            <span>If anything is unclear we will email you rather than reject it.</span>
          </div>
          <div>
            <b>The moment we approve: you go live</b>
            <span>
              Your code appears, your dashboard switches on, and your Pro account becomes free for
              twelve months.
            </span>
          </div>
        </div>
        <div className={s.callout}>
          <span>
            In the meantime your Jooma account works exactly as it did. You will see{" "}
            <b>Ambassador Programme</b> in your account menu with an <b>Under review</b> label on it.
          </span>
        </div>
      </div>

      <div className={s.card}>
        <h2 className={s.h2}>While you wait</h2>
        <div className={s.rowline}>
          <span className={s.rowIcon} style={{ background: "var(--j-purple)" }}>
            <SquaresFour size={17} weight="fill" />
          </span>
          <span className={s.rowMain}>
            <b>Go back to Jooma</b>
            <span>Your plan and library are untouched.</span>
          </span>
          <span className={s.rowRight}>
            <Link href="/dashboard" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}>
              Open Jooma
            </Link>
          </span>
        </div>
        <div className={s.rowline}>
          <span className={s.rowIcon} style={{ background: "#0E7490" }}>
            <FileText size={17} weight="fill" />
          </span>
          <span className={s.rowMain}>
            <b>Your signed agreement</b>
            <span>Read it or print a copy for your records.</span>
          </span>
          <span className={s.rowRight}>
            <Link href="/ambassador/agreement" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}>
              View
            </Link>
          </span>
        </div>
      </div>
      <ContactLine />
    </div>
  );
}

function ContactLine() {
  return (
    <p style={{ textAlign: "center", marginTop: 24, fontSize: ".86rem", color: "var(--j-faint)" }}>
      Something not right? Email{" "}
      <a href="mailto:ambassadors@jooma.ai" style={{ color: "var(--j-purple)", fontWeight: 700 }}>
        ambassadors@jooma.ai
      </a>{" "}
      and a person will reply.
    </p>
  );
}
