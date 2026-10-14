import {
  agreementClauses,
  agreementFooter,
  agreementIntro,
  type AgreementParty,
} from "@/app/lib/ambassador-agreement";
import s from "./programme.module.css";

/** The agreement's text, from app/lib/ambassador-agreement.ts. */
export default function AgreementText({ party }: { party: AgreementParty }) {
  return (
    <>
      <p className={s.contractTitle}>JOOMA LTD: AMBASSADOR AGREEMENT</p>
      <p>{agreementIntro(party)}</p>
      {agreementClauses(party).map((c) => (
        <div key={c.heading}>
          <h3>{c.heading}</h3>
          {c.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
          {c.bullets && (
            <ul>
              {c.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          {c.after?.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      ))}
      <p style={{ marginTop: 22, color: "var(--j-faint)", fontSize: ".82rem" }}>{agreementFooter()}</p>
    </>
  );
}
