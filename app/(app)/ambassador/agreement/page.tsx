import { redirect } from "next/navigation";
import { CalendarBlank, SealCheck, Signature } from "@phosphor-icons/react/dist/ssr";
import { AGREEMENT_VERSION } from "@/app/lib/ambassador-agreement";
import { daysUntil } from "@/app/lib/plan-badge";
import AgreementText from "@/app/components/ambassador/AgreementText";
import s from "@/app/components/ambassador/programme.module.css";
import { agreementLive, loadAgreementState, loadAmbassadorContext, loadDetails } from "../data";
import { MIN_VERSION, versionAtLeast } from "@/app/lib/ambassador-activity";
import AcceptAgreement from "./AcceptAgreement";
import { Metric, Panel, longDate } from "../parts";
import { EndAgreement, PrintButton } from "./AgreementActions";

// My agreement tab: when it was signed, when it ends, and the text. Also open
// to an applicant still under review, who reaches it from their status page.
export const dynamic = "force-dynamic";

export default async function AmbassadorAgreement() {
  const [ctx, details, agreement] = await Promise.all([
    loadAmbassadorContext(),
    loadDetails(),
    loadAgreementState(),
  ]);
  if (!ctx.ambassador && !details) redirect("/ambassador");

  const a = ctx.ambassador;
  const now = new Date();
  const ends = a?.agreement_ends_at ? new Date(a.agreement_ends_at) : null;
  const live = a ? agreementLive(a) : false;
  const status = !a
    ? "Under review"
    : a.status === "ended"
      ? "Ended"
      : a.status !== "active"
        ? "Paused"
        : ends && ends.getTime() < now.getTime()
          ? "Ended"
          : a.review_started_at
            ? "Under review"
            : "Active";
  const name = details ? `${details.first_name} ${details.last_name}` : a?.full_name ?? "";
  const reminder = ends ? new Date(ends.getTime() - 30 * 86_400_000) : null;

  const inForce = agreement.inForce;
  const accepted = inForce?.acceptedAt ? inForce : null;

  return (
    <div className={a ? undefined : `${s.wrap} ${s.narrow}`}>
      {agreement.offer && inForce && (
        <div id="accept">
          <Panel title={`Accept version ${AGREEMENT_VERSION} of the agreement`} first>
            <AcceptAgreement
              onVersion={inForce.version}
              fullName={name}
              bringsClauseFive={!versionAtLeast(inForce.version, MIN_VERSION)}
            />
          </Panel>
        </div>
      )}

      <Panel title="Your signed agreement" first={!agreement.offer} right={<PrintButton />}>
        <div className={s.mgrid} style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <Metric
            icon={<Signature size={14} weight="fill" />}
            label="Signed"
            value={details ? new Date(details.signed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Not on file"}
            sub={details ? `By ${details.signature_name}` : undefined}
          />
          <Metric
            icon={<CalendarBlank size={14} weight="fill" />}
            label="Runs until"
            value={ends ? ends.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Not started"}
            sub={ends ? (live ? `${daysUntil(ends, now)} days left` : "Ended") : "Twelve months from approval"}
          />
          <Metric
            hero
            icon={<SealCheck size={14} weight="fill" />}
            label="Status"
            value={status}
            sub={a?.approved_at ? `Approved ${longDate(a.approved_at)}` : "We will be in touch"}
          />
        </div>
        {reminder && live && (
          <div className={`${s.callout} ${s.calloutGold}`}>
            <span>
              This does not renew on its own. We will write to you on {longDate(reminder)}, a month
              before it ends, to ask whether you want to carry on.
            </span>
          </div>
        )}
      </Panel>

      <Panel
        title="What you signed"
        right={<span className={`${s.badge} ${s.bRev}`}>Version {inForce?.version ?? AGREEMENT_VERSION}</span>}
      >
        <div className={s.contract} style={{ maxHeight: 420 }} data-testid="signed-agreement">
          <AgreementText
            party={{
              name,
              address: details ? `${details.address_line}, ${details.town} ${details.postcode}` : undefined,
              code: a?.codes[0],
            }}
          />
        </div>
        {accepted && details && (
          <p className={s.muted} style={{ fontSize: ".82rem" }} data-testid="accepted-note">
            You accepted version {accepted.version} on {longDate(accepted.acceptedAt!)}, as {accepted.signatureName}.
            Your first signature, on version {details.agreement_version}, is kept on file too.
          </p>
        )}
        {inForce && inForce.version !== AGREEMENT_VERSION && (
          <p className={s.muted} style={{ fontSize: ".82rem" }}>
            You are on version {inForce.version}. The text above is version {AGREEMENT_VERSION}
            {agreement.offer ? ", which you can accept at the top of this page" : ""}. Until you do, version{" "}
            {inForce.version} applies; ask us for a copy of it.
          </p>
        )}
      </Panel>

      {a && live && (
        <Panel title="Ending it early">
          <p className={s.muted}>
            You can leave with 30 days&apos; notice at any time. Your balance is paid in full at the
            next payout whatever the amount. Your free Pro ends with the notice period and your
            account moves to the Free plan. We never charge you unless you choose a paid plan yourself.
          </p>
          <EndAgreement requestedAt={a.end_requested_at} />
        </Panel>
      )}
    </div>
  );
}
