"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bank,
  Check,
  Crown,
  FacebookLogo,
  InstagramLogo,
  LinkedinLogo,
  PaypalLogo,
  Phone,
  ShieldCheck,
  Signature,
  TiktokLogo,
  Warning,
  XLogo,
  YoutubeLogo,
} from "@phosphor-icons/react";
import {
  CHANNELS,
  CODE_EXAMPLES,
  REACH_OPTIONS,
  TAX_OPTIONS,
  codeProblem,
  normaliseAmbassadorCode,
  validateAgreement,
  validateChannels,
  validatePayout,
  validatePersonal,
  type AgreementInput,
  type ChannelsInput,
  type FieldErrors,
  type PayoutInput,
  type PersonalInput,
} from "@/app/lib/ambassador-application";
import { AGREEMENT_IS_DRAFT, DECLARATIONS } from "@/app/lib/ambassador-agreement";
import AgreementText from "@/app/components/ambassador/AgreementText";
import ApplicationStatus from "@/app/components/ambassador/ApplicationStatus";
import s from "@/app/components/ambassador/programme.module.css";

const STEPS = ["Personal", "Social", "Payout", "Agreement"] as const;

const CHANNEL_ICON: Record<string, React.ReactNode> = {
  instagram: <InstagramLogo size={17} />,
  tiktok: <TiktokLogo size={17} />,
  x_handle: <XLogo size={17} />,
  facebook: <FacebookLogo size={17} />,
  youtube: <YoutubeLogo size={17} />,
  linkedin: <LinkedinLogo size={17} />,
};

type CodeCheck = "idle" | "checking" | "free" | "taken" | "error";

/**
 * The four-step application from the mockup, with two additions on the Payout
 * step: Bank or PayPal, and the code they want, which is permanent.
 *
 * Each step is checked with the same rules the server applies
 * (app/lib/ambassador-application.ts) before moving on, so a mistake shows where
 * it was made rather than at the end. Nothing is saved until they sign; the
 * non-sensitive fields are kept in this tab's sessionStorage so a refresh does
 * not lose them. Bank details are never stored in the browser.
 */
export default function ApplyFlow({
  token,
  defaults,
}: {
  token: string;
  defaults: { first_name: string; last_name: string; email: string; mobile: string };
}) {
  const draftKey = `jooma:ambassador-application:${token.slice(0, 16)}`;
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const [personal, setPersonal] = useState<PersonalInput>({
    first_name: defaults.first_name,
    last_name: defaults.last_name,
    email: defaults.email,
    mobile: defaults.mobile,
    date_of_birth: "",
    address_line: "",
    town: "",
    postcode: "",
    school: "",
    teaches: "",
  });
  const [channels, setChannels] = useState<ChannelsInput>({
    instagram: "",
    tiktok: "",
    x_handle: "",
    facebook: "",
    youtube: "",
    linkedin: "",
    reach: "",
    note: "",
  });
  const [payout, setPayout] = useState<PayoutInput>({
    payout_method: "bank",
    account_holder: [defaults.first_name, defaults.last_name].filter(Boolean).join(" "),
    sort_code: "",
    account_number: "",
    bank_name: "",
    paypal_email: "",
    tax_status: "self_assessment",
    utr: "",
    requested_code: "",
  });
  const [agreement, setAgreement] = useState<AgreementInput>({
    signature_name: "",
    read: false,
    tax: false,
    disclosure: false,
  });
  const [readToEnd, setReadToEnd] = useState(false);
  const [codeCheck, setCodeCheck] = useState<CodeCheck>("idle");
  const contractRef = useRef<HTMLDivElement>(null);

  // Restore a draft from this tab, once.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.personal) setPersonal((p) => ({ ...p, ...d.personal }));
      if (d.channels) setChannels((c) => ({ ...c, ...d.channels }));
      if (d.code) setPayout((p) => ({ ...p, requested_code: d.code }));
    } catch {
      // A bad draft is ignored, not fatal.
    }
  }, [draftKey]);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({ personal, channels, code: payout.requested_code }),
      );
    } catch {
      // Storage can be full or blocked; the form still works.
    }
  }, [draftKey, personal, channels, payout.requested_code]);

  // Is the code free? Checked as they type, after a pause.
  const code = normaliseAmbassadorCode(payout.requested_code);
  useEffect(() => {
    if (!code || codeProblem(code)) {
      setCodeCheck("idle");
      return;
    }
    setCodeCheck("checking");
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/ambassadors/code-available?code=${encodeURIComponent(code)}`);
        const json = await res.json();
        setCodeCheck(res.ok ? (json.available ? "free" : "taken") : "error");
      } catch {
        setCodeCheck("error");
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [code]);

  // A short agreement on a tall screen has nothing to scroll.
  useEffect(() => {
    if (step !== 3) return;
    const el = contractRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 24) setReadToEnd(true);
  }, [step]);

  const go = (next: number) => {
    setStep(next);
    setErrors({});
    window.scrollTo({ top: 0 });
  };

  const continueFrom = (current: number) => {
    const e =
      current === 0
        ? validatePersonal(personal)
        : current === 1
          ? validateChannels(channels)
          : validatePayout(payout);
    if (current === 2 && codeCheck === "taken") e.requested_code = "That code is already taken. Try another.";
    setErrors(e);
    if (Object.keys(e).length === 0) go(current + 1);
  };

  const submit = async () => {
    const e = validateAgreement(agreement);
    setErrors(e);
    if (Object.keys(e).length > 0 || !readToEnd) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch("/api/ambassadors/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, input: { personal, channels, payout, agreement } }),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error ?? "Could not send your application.");
        if (json.errors) setErrors(json.errors);
        return;
      }
      try {
        sessionStorage.removeItem(draftKey);
      } catch {
        // Nothing to clear.
      }
      setDone(new Date().toISOString());
      window.scrollTo({ top: 0 });
    } catch {
      setServerError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className={s.root}>
        <ApplicationStatus status="pending" submittedAt={done} />
      </div>
    );
  }

  const canSign =
    readToEnd &&
    agreement.read &&
    agreement.tax &&
    agreement.disclosure &&
    agreement.signature_name.trim().length >= 4;
  const fullName = `${personal.first_name} ${personal.last_name}`.trim();

  return (
    <div className={`${s.root} ${s.wrap} ${s.narrow}`} data-testid="apply-flow">
      <Steps current={step} />

      {step === 0 && (
        <>
          <h1 className={s.h1}>Let us start with you.</h1>
          <p className={s.lead}>
            This is what goes on your agreement, so use your legal name as it appears on your bank
            account.
          </p>
          <div className={s.card}>
            <div className={s.fgrid}>
              <Text label="First name" value={personal.first_name} error={errors.first_name} onChange={(v) => setPersonal({ ...personal, first_name: v })} autoComplete="given-name" />
              <Text label="Last name" value={personal.last_name} error={errors.last_name} onChange={(v) => setPersonal({ ...personal, last_name: v })} autoComplete="family-name" />
              <Text full label="Email" type="email" value={personal.email} error={errors.email} hint="We will send your agreement and every statement here." onChange={(v) => setPersonal({ ...personal, email: v })} autoComplete="email" />
              <div className={s.f}>
                <label htmlFor="amb-mobile">Mobile</label>
                <div className={s.pre}>
                  <span className={s.prefix}>
                    <Phone size={17} />
                  </span>
                  <input id="amb-mobile" className={s.input} value={personal.mobile} onChange={(e) => setPersonal({ ...personal, mobile: e.target.value })} placeholder="+44 7700 900412" autoComplete="tel" />
                </div>
                {errors.mobile && <span className={s.error}>{errors.mobile}</span>}
              </div>
              <Text label="Date of birth" type="date" value={personal.date_of_birth} error={errors.date_of_birth} onChange={(v) => setPersonal({ ...personal, date_of_birth: v })} autoComplete="bday" />
              <Text full label="Address" value={personal.address_line} error={errors.address_line} placeholder="Street" onChange={(v) => setPersonal({ ...personal, address_line: v })} autoComplete="street-address" />
              <Text label="Town or city" value={personal.town} error={errors.town} onChange={(v) => setPersonal({ ...personal, town: v })} autoComplete="address-level2" />
              <Text label="Postcode" value={personal.postcode} error={errors.postcode} onChange={(v) => setPersonal({ ...personal, postcode: v })} autoComplete="postal-code" />
              <Text full label="Your school or setting" optional value={personal.school} error={errors.school} onChange={(v) => setPersonal({ ...personal, school: v })} />
              <Text full label="What do you teach?" optional value={personal.teaches} error={errors.teaches} placeholder="Year 4, mostly maths and science" onChange={(v) => setPersonal({ ...personal, teaches: v })} />
            </div>
            <div className={s.callout}>
              <ShieldCheck size={17} weight="fill" />
              <span>
                Your address and date of birth are used only for the agreement and for the checks
                our payment provider requires. They never appear anywhere public.
              </span>
            </div>
          </div>
          <div className={s.actions}>
            <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={() => continueFrom(0)}>
              Continue <ArrowRight size={15} weight="bold" />
            </button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <h1 className={s.h1}>Where do you post?</h1>
          <p className={s.lead}>
            Add every account you would use to share your code. At least one is needed. You can
            change these later from your dashboard.
          </p>
          <div className={s.card}>
            <div className={s.fgrid}>
              {CHANNELS.map((ch, i) => (
                <div key={ch.key} className={`${s.f} ${i >= 4 ? s.full : ""}`}>
                  <label htmlFor={`amb-${ch.key}`}>
                    {ch.label} <small>optional</small>
                  </label>
                  <div className={s.pre}>
                    <span className={s.prefix}>
                      {CHANNEL_ICON[ch.key]}
                      {ch.prefix}
                    </span>
                    <input
                      id={`amb-${ch.key}`}
                      className={s.input}
                      value={channels[ch.key]}
                      onChange={(e) => setChannels({ ...channels, [ch.key]: e.target.value })}
                      placeholder="handle"
                    />
                  </div>
                </div>
              ))}
            </div>
            {errors.channels && <p className={s.error} style={{ marginTop: 10 }}>{errors.channels}</p>}
            <div className={s.fgrid} style={{ marginTop: 16 }}>
              <div className={`${s.f} ${s.full}`}>
                <label htmlFor="amb-reach">Roughly how many followers, across everything?</label>
                <select id="amb-reach" className={s.input} value={channels.reach} onChange={(e) => setChannels({ ...channels, reach: e.target.value })}>
                  <option value="">Choose one</option>
                  {REACH_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {errors.reach && <span className={s.error}>{errors.reach}</span>}
              </div>
              <div className={`${s.f} ${s.full}`}>
                <label htmlFor="amb-note">
                  Anything we should know? <small>optional</small>
                </label>
                <textarea id="amb-note" rows={3} className={s.input} value={channels.note} onChange={(e) => setChannels({ ...channels, note: e.target.value })} placeholder="A newsletter, a staffroom you run, a TeachMeet you speak at. Anything that helps us understand your reach." />
              </div>
            </div>
            <div className={`${s.callout} ${s.calloutGold}`}>
              <Crown size={17} weight="fill" />
              <span>We read every application. We are looking for teachers who already share resources, not follower counts.</span>
            </div>
          </div>
          <div className={s.actions}>
            <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={() => continueFrom(1)}>
              Continue <ArrowRight size={15} weight="bold" />
            </button>
            <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => go(0)}>
              Back
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h1 className={s.h1}>Where should we pay you?</h1>
          <p className={s.lead}>
            Payouts land on the 15th of each month, covering the month before. The account must be
            in your own name.
          </p>
          <div className={s.card}>
            <div className={s.methods} role="radiogroup" aria-label="How we pay you">
              <button
                type="button"
                role="radio"
                aria-checked={payout.payout_method === "bank"}
                className={`${s.method} ${payout.payout_method === "bank" ? s.methodOn : ""}`}
                onClick={() => setPayout({ ...payout, payout_method: "bank" })}
              >
                <Bank size={24} weight="duotone" />
                <span>
                  <b>Bank transfer</b>
                  <span>A UK account in your name</span>
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={payout.payout_method === "paypal"}
                className={`${s.method} ${payout.payout_method === "paypal" ? s.methodOn : ""}`}
                onClick={() => setPayout({ ...payout, payout_method: "paypal" })}
              >
                <PaypalLogo size={24} weight="duotone" />
                <span>
                  <b>PayPal</b>
                  <span>Paid to your PayPal email</span>
                </span>
              </button>
            </div>

            <div className={s.fgrid}>
              <Text full label="Account holder name" value={payout.account_holder} error={errors.account_holder} hint={payout.payout_method === "bank" ? "Exactly as your bank has it." : "The name on your PayPal account."} onChange={(v) => setPayout({ ...payout, account_holder: v })} />
              {payout.payout_method === "bank" ? (
                <>
                  <Text label="Sort code" value={payout.sort_code} error={errors.sort_code} placeholder="00-00-00" inputMode="numeric" onChange={(v) => setPayout({ ...payout, sort_code: v })} />
                  <Text label="Account number" value={payout.account_number} error={errors.account_number} placeholder="8 digits" inputMode="numeric" onChange={(v) => setPayout({ ...payout, account_number: v })} />
                  <Text full label="Bank name" value={payout.bank_name} error={errors.bank_name} placeholder="Monzo Bank Ltd" onChange={(v) => setPayout({ ...payout, bank_name: v })} />
                </>
              ) : (
                <Text full label="PayPal email" type="email" value={payout.paypal_email} error={errors.paypal_email} hint="The address you log in to PayPal with." onChange={(v) => setPayout({ ...payout, paypal_email: v })} />
              )}
            </div>

            <h3 className={s.sectionTitle}>Tax</h3>
            <p className={s.muted}>
              Commission is paid gross. You are responsible for declaring it to HMRC. We will send
              you a yearly summary each April to make that easier.
            </p>
            <div className={s.fgrid} style={{ marginTop: 14 }}>
              <div className={`${s.f} ${s.full}`}>
                <label htmlFor="amb-tax">How do you declare this income?</label>
                <select id="amb-tax" className={s.input} value={payout.tax_status} onChange={(e) => setPayout({ ...payout, tax_status: e.target.value })}>
                  {TAX_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <Text full label="UTR" optional value={payout.utr} error={errors.utr} placeholder="10 digits, if you have one" hint="Not required to join. It helps us produce your yearly summary correctly." inputMode="numeric" onChange={(v) => setPayout({ ...payout, utr: v })} />
            </div>
            <div className={`${s.callout} ${s.calloutWarn}`}>
              <Warning size={17} weight="fill" />
              <span>
                If you are employed by a school, check your contract before taking paid work
                alongside it. Many teaching contracts require you to declare outside earnings, and a
                few restrict them.
              </span>
            </div>

            <div className={s.codeCard} data-testid="code-card">
              <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Crown size={18} weight="fill" color="#C08A1E" /> Your code
              </h3>
              <p className={s.muted}>
                The code teachers type when they sign up. They get money off their first payment,
                and you earn on every teacher who uses it.
              </p>
              <div className={s.f} style={{ marginTop: 14 }}>
                <label htmlFor="amb-code">The code you want</label>
                <input
                  id="amb-code"
                  className={`${s.input} ${s.codeInput} ${errors.requested_code ? s.inputBad : ""}`}
                  value={payout.requested_code}
                  onChange={(e) => setPayout({ ...payout, requested_code: e.target.value.toUpperCase() })}
                  placeholder="PRIYA-4K2"
                  maxLength={20}
                  autoComplete="off"
                  spellCheck={false}
                />
                <span className={s.hint}>4 to 20 letters, numbers or hyphens. For example:</span>
                <div className={s.chips}>
                  {CODE_EXAMPLES.map((c) => (
                    <button key={c} type="button" className={s.chip} onClick={() => setPayout({ ...payout, requested_code: c })}>
                      {c}
                    </button>
                  ))}
                </div>
                <CodeStatus code={code} check={codeCheck} error={errors.requested_code} />
              </div>
              <p className={s.permanent} data-testid="code-permanent">
                <Signature size={18} weight="fill" style={{ flex: "none", marginTop: 2 }} />
                <span>
                  This code is permanent. When we approve you it is created exactly as you write it
                  here and can&apos;t be changed or regenerated later, so pick one you&apos;ll be
                  happy sharing for the whole year.
                </span>
              </p>
            </div>
          </div>
          <div className={s.actions}>
            <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={() => continueFrom(2)} disabled={codeCheck === "checking"}>
              Continue to the agreement <ArrowRight size={15} weight="bold" />
            </button>
            <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => go(1)}>
              Back
            </button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <h1 className={s.h1}>The agreement.</h1>
          <p className={s.lead}>Twelve months. Read it properly: scroll to the bottom and the signature box unlocks.</p>
          {AGREEMENT_IS_DRAFT && (
            <div className={s.draftbar}>
              <b>Placeholder text.</b> The clauses below set out the commercial terms correctly, but
              they have not yet been reviewed by a solicitor.
            </div>
          )}
          <div
            ref={contractRef}
            className={`${s.contract} ${readToEnd ? s.contractRead : ""}`}
            data-testid="contract"
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setReadToEnd(true);
            }}
          >
            <AgreementText
              party={{
                name: fullName || "the Ambassador",
                address: [personal.address_line, personal.town, personal.postcode].filter(Boolean).join(", "),
                code: code || undefined,
              }}
            />
          </div>

          {DECLARATIONS.map((d) => {
            const on = agreement[d.key];
            return (
              <button
                key={d.key}
                type="button"
                role="checkbox"
                aria-checked={on}
                className={`${s.chk} ${on ? s.chkOn : ""}`}
                onClick={() => setAgreement({ ...agreement, [d.key]: !on })}
              >
                <span className={s.box}>{on && <Check size={12} weight="bold" />}</span>
                <span>{d.label}</span>
              </button>
            );
          })}
          {errors.declarations && <p className={s.error} style={{ marginTop: 10 }}>{errors.declarations}</p>}

          <div className={s.sigbox}>
            <div className={s.f}>
              <label htmlFor="amb-sign">Type your full name to sign</label>
              <input
                id="amb-sign"
                className={s.input}
                value={agreement.signature_name}
                onChange={(e) => setAgreement({ ...agreement, signature_name: e.target.value })}
                placeholder={fullName || "Your full name"}
                disabled={!readToEnd}
                autoComplete="name"
              />
              <span className={s.hint}>
                {readToEnd
                  ? "Typing your name here is a legally binding electronic signature under the Electronic Communications Act 2000."
                  : "Scroll to the end of the agreement to sign."}
              </span>
              {errors.signature_name && <span className={s.error}>{errors.signature_name}</span>}
            </div>
            <div className={s.sigpad}>
              <div>
                <span className={s.sig}>{agreement.signature_name.trim() || " "}</span>
                <small>
                  {agreement.signature_name.trim().length >= 4
                    ? `Signed ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`
                    : "Not yet signed"}
                </small>
              </div>
            </div>
          </div>

          {serverError && (
            <p className={s.error} role="alert" style={{ marginTop: 16 }}>
              {serverError}
            </p>
          )}
          <div className={s.actions}>
            <button type="button" className={`${s.btn} ${s.btnPrimary} ${s.btnLg}`} onClick={submit} disabled={!canSign || submitting}>
              {submitting ? "Sending…" : "Sign and send for review"} <Signature size={16} weight="fill" />
            </button>
            <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => go(2)} disabled={submitting}>
              Back
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Steps({ current }: { current: number }) {
  return (
    <div className={s.steps} aria-label={`Step ${current + 1} of ${STEPS.length}`}>
      {STEPS.map((label, i) => (
        <span key={label} className={`${s.stp} ${i < current ? s.stpDone : ""} ${i === current ? s.stpNow : ""}`}>
          <span className={s.stpN}>{i < current ? <Check size={13} weight="bold" /> : i + 1}</span>
          <span className={s.stpL}>{label}</span>
          {i < STEPS.length - 1 && <span className={s.stpBar} />}
        </span>
      ))}
    </div>
  );
}

function CodeStatus({ code, check, error }: { code: string; check: CodeCheck; error?: string }) {
  const problem = code ? codeProblem(code) : null;
  if (error) return <span className={s.error}>{error}</span>;
  if (problem && code) return <span className={s.error}>{problem}</span>;
  if (check === "checking") return <span className={s.hint}>Checking {code}…</span>;
  if (check === "free")
    return (
      <span className={`${s.hint} ${s.ok}`} style={{ fontWeight: 700 }} data-testid="code-free">
        {code} is free.
      </span>
    );
  if (check === "taken") return <span className={s.error}>{code} is already taken. Try another.</span>;
  if (check === "error") return <span className={s.hint}>Could not check that just now. We will check again when you send it.</span>;
  return null;
}

function Text({
  label,
  value,
  onChange,
  error,
  hint,
  full,
  optional,
  type = "text",
  placeholder,
  autoComplete,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  full?: boolean;
  optional?: boolean;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: "numeric" | "text" | "email";
}) {
  const id = `amb-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <div className={`${s.f} ${full ? s.full : ""}`}>
      <label htmlFor={id}>
        {label} {optional && <small>optional</small>}
      </label>
      <input
        id={id}
        type={type}
        className={`${s.input} ${error ? s.inputBad : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
      />
      {hint && !error && <span className={s.hint}>{hint}</span>}
      {error && <span className={s.error}>{error}</span>}
    </div>
  );
}
