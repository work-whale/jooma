// The ambassador agreement.
//
// Built from the rate constants rather than typed out, so the agreement an
// applicant signs can never quote a rate the webhook does not pay. Each
// application stores the version it was signed under (agreement_version), and
// the My agreement tab shows that version back.
//
// Bump AGREEMENT_VERSION (and AGREEMENT_DATE) whenever the text changes.
import {
  AGREEMENT_MONTHS,
  AMBASSADOR_RATES,
  PAYOUT_DAY,
  gbp,
} from './ambassador-commission';

export const AGREEMENT_VERSION = '0.3';
export const AGREEMENT_DATE = '15 October 2026';

export interface Clause {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  /** After the bullets. */
  after?: string[];
}

export interface AgreementParty {
  name: string;
  /** One line, e.g. "42 Hartley Road, Leeds LS6 2JT". Optional on the preview. */
  address?: string;
  code?: string;
}

export function agreementIntro(party: AgreementParty): string {
  const who = party.address ? `${party.name} of ${party.address}` : party.name;
  return (
    `This agreement is between Jooma Ltd (company number to be inserted), registered in ` +
    `England and Wales, and ${who} ("the Ambassador").`
  );
}

export function agreementClauses(party: AgreementParty): Clause[] {
  const m = AMBASSADOR_RATES.month;
  const y = AMBASSADOR_RATES.year;
  const months =
    AGREEMENT_MONTHS === 12 ? 'twelve months' : `${AGREEMENT_MONTHS} months`;
  const codeName = party.code
    ? `the code ${party.code}`
    : 'the code you chose when you applied';

  return [
    {
      heading: '1. What this is',
      paragraphs: [
        'You agree to promote Jooma using a unique referral code. We agree to pay you commission on the subscriptions that result, and to give you a Pro account at no charge for the length of this agreement. You are not an employee, a worker, or an agent of Jooma. You are self-employed and responsible for your own tax and National Insurance.',
      ],
    },
    {
      heading: '2. Your code',
      paragraphs: [
        `Your code is ${codeName}. It is created exactly as written when we approve you and cannot be changed or regenerated afterwards.`,
        'A teacher who uses your code gets money off their first payment: off the first month on a monthly plan, or the same value off the first year on a yearly plan. The discount is set by us and shown on your dashboard.',
      ],
    },
    {
      heading: '3. How long it lasts',
      paragraphs: [
        `${capitalise(months)} from the date we approve your application. It does not renew automatically. We will write to you a month before it ends to ask whether you want to continue.`,
        "Either of us may end it earlier with 30 days' written notice. We may end it immediately if clause 7 is broken.",
      ],
    },
    {
      heading: '4. What we pay you',
      paragraphs: ['For each new paying subscriber who uses your code:'],
      bullets: [
        `Standard, paid monthly: ${gbp(m.standard)} for each month that subscriber pays`,
        `Pro, paid monthly: ${gbp(m.pro)} for each month that subscriber pays`,
        `Max, paid monthly: ${gbp(m.max)} for each month that subscriber pays`,
        `Standard, paid yearly: ${gbp(y.standard)}, once, on their first payment`,
        `Pro, paid yearly: ${gbp(y.pro)}, once, on their first payment`,
        `Max, paid yearly: ${gbp(y.max)}, once, on their first payment`,
      ],
      after: [
        'Commission is earned when a payment clears, not when someone signs up. A free trial earns nothing until the first real payment is taken.',
        'Commission is earned only on payments made while this agreement is live. A payment made after it ends earns nothing, even if the subscriber keeps paying.',
      ],
    },
    {
      heading: '5. When we pay you',
      paragraphs: [
        `On the ${ordinal(PAYOUT_DAY)} of each month, for the month before, by bank transfer to a UK account in your own name or to your PayPal account, whichever you gave us. If the ${ordinal(PAYOUT_DAY)} is a weekend or bank holiday, the next working day.`,
        'There is no minimum. Whatever your balance comes to, it is paid in full every month.',
      ],
    },
    {
      heading: '6. Refunds, chargebacks and cancelled trials',
      paragraphs: [
        'If a subscriber is refunded, charges back, or cancels within our refund window, the commission for that payment is removed from your balance. If it has already been paid to you, it is deducted from your next statement.',
      ],
    },
    {
      heading: '7. What you must not do',
      paragraphs: [],
      bullets: [
        'Use your own code, or ask anyone to sign up on your behalf and reimburse them',
        'Bid on "Jooma" or close variations in paid search',
        'Offer cashback, rebates or incentives for using your code without asking us first',
        'Say anything about Jooma that is not true, including about results, pricing, or data',
        'Present yourself as an employee of Jooma, or speak on our behalf',
        'Share pupil data, or anything that could identify a child, in any content featuring Jooma',
      ],
      after: [
        'Breaking any of these ends this agreement immediately and forfeits any unpaid balance.',
      ],
    },
    {
      heading: '8. Disclosure',
      paragraphs: [
        'You must make clear that you are paid when you promote Jooma: "#ad", "paid partnership", or similar, on every post, in line with the CAP Code and ASA guidance. This is your legal obligation as well as ours.',
      ],
    },
    {
      heading: '9. Your free Pro account',
      paragraphs: [
        'Provided for the length of this agreement, for your own teaching use. It is not transferable. It reverts to a normal paid plan when this agreement ends, and we will tell you before that happens.',
      ],
    },
    {
      heading: '10. Your data',
      paragraphs: [
        'We hold your details to run this programme and to pay you, and we keep payment records for six years as HMRC requires. Our privacy notice at jooma.ai/privacy applies. You can ask for a copy of what we hold at any time.',
      ],
    },
    {
      heading: '11. Changes to the rates',
      paragraphs: [
        "We may change the commission rates with 60 days' written notice. Payments already earned keep the rate they were earned at. If you do not accept a change, you may end this agreement and we will pay your balance in full.",
      ],
    },
    {
      heading: '12. Law',
      paragraphs: [
        'This agreement is governed by the law of England and Wales, and the courts of England and Wales have exclusive jurisdiction.',
      ],
    },
  ];
}

export function agreementFooter(): string {
  return `End of agreement. Version ${AGREEMENT_VERSION}, ${AGREEMENT_DATE}.`;
}

/** The three boxes ticked before signing. */
export const DECLARATIONS = [
  {
    key: 'read',
    label: `I have read the agreement and I understand that it runs for ${AGREEMENT_MONTHS === 12 ? 'twelve' : AGREEMENT_MONTHS} months.`,
  },
  {
    key: 'tax',
    label:
      'I understand that commission is paid gross and that declaring it to HMRC is my responsibility.',
  },
  {
    key: 'disclosure',
    label:
      'I will disclose that I am paid whenever I promote Jooma, on every post.',
  },
] as const;

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
