import type { Metadata } from "next";
import { SUB_PROCESSORS } from "@/app/lib/legal/sub-processors";
import Wordmark from "@/app/components/v2/Wordmark";

/* See the note in app/terms/page.tsx: same inherited-title problem, same
 * canonical reasoning. */
export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What data Jooma collects, why, and what you can ask us to do with it.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh" style={{ backgroundColor: "var(--j-tint)" }}>
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10" style={{ color: "var(--j-purple)" }}>
          <Wordmark height={26} />
        </div>

        <h1 className="text-4xl font-semibold tracking-tight mb-2" style={{ color: "var(--j-purple)" }}>
          Privacy Policy
        </h1>
        <p className="text-sm mb-10" style={{ color: "#7a604a" }}>Last updated: 19 November 2026</p>

        <div className="rounded-2xl p-8 space-y-8" style={{ backgroundColor: "var(--j-card)" }}>

          <Section title="1. Who We Are">
            <p>Jooma Ltd (&quot;Jooma&quot;, &quot;we&quot;, &quot;us&quot;) is the data controller for personal data processed through our service. We are registered in England and Wales.</p>
            <p>If you have any questions about how we handle your data, contact our team at <a href="mailto:info@jooma.ai" className="underline">info@jooma.ai</a>.</p>
          </Section>

          <Section title="2. Data We Collect">
            <p>We collect the following categories of personal data:</p>
            <Table rows={[
              ["Account data", "First name, surname, email address, phone number, country"],
              ["Optional profile details", "Your role (for example class teacher or SENCo) and the name of your school, only if you choose to give them when you sign up"],
              ["Usage data", "Pages visited, features used, prompts submitted, content generated, how many resources you have used, the date you last visited, and timestamps"],
              ["Technical data", "IP address, browser type, device type, operating system"],
              ["Where you came from", "The advert campaign or website that brought you to Jooma, if there was one (see section 9)"],
              ["Payment data", "Billing details processed by our payment provider (we do not store card numbers)"],
              ["Communications", "Any messages you send us, and whether our emails to you were delivered"],
              ["Your cookie choice", "Whether you accepted or rejected advertising cookies, and when"],
              ["Unfinished signups", "If you enter your email address to sign up but do not finish, we keep that address for up to 30 days so we can remind you, then delete it"],
            ]} />
            <p>We do not knowingly collect data from anyone under 18. If you believe a minor has created an account, contact us and we will delete it.</p>
          </Section>

          <Section title="3. How We Use Your Data">
            <p>We use your personal data to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Provide and improve the service:</strong> process your prompts, generate content, and save your work.</li>
              <li><strong>Manage your account:</strong> sign you in, handle support queries, and send service emails, such as when your trial is ending, when you are running low on resources, or when a payment has a problem.</li>
              <li><strong>Suggest the right plan:</strong> show short messages in the app based on how you use Jooma, for example when you are close to your monthly allowance. These use only Jooma&apos;s own records and nothing is shared to show them.</li>
              <li><strong>Send you product news by email</strong>, such as new features and teaching ideas, including an idea for the week if you have not visited for two weeks. You can say no when you sign up, turn it off in the Emails section of your profile, or use the one-click unsubscribe link in any of these emails.</li>
              <li><strong>Process payments:</strong> handle subscription billing and send receipts.</li>
              <li><strong>Understand which schools use Jooma:</strong> group accounts by school name and school email domain, so we can offer schools a plan for their staff. When you type your school&apos;s name, we may suggest names that at least two other teachers have typed. We never show who typed them.</li>
              <li><strong>Prevent abuse:</strong> limit free trials to one per person, which includes noting the device a trial was started on.</li>
              <li><strong>Analyse usage:</strong> understand how the service is used and which channels bring teachers to us, so we can improve it (aggregated where possible).</li>
              <li><strong>Measure our advertising, only if you agree:</strong> see section 9.</li>
              <li><strong>Legal compliance:</strong> meet our obligations under UK law.</li>
            </ul>
          </Section>

          <Section title="4. Legal Basis for Processing">
            <p>Under UK GDPR, we process your data on the following bases:</p>
            <Table rows={[
              ["Contract performance", "Processing necessary to provide the service you signed up for, including service emails about your account"],
              ["Legitimate interests", "Improving the service, in-app plan suggestions, counting which channels bring signups, understanding which schools use Jooma, fraud and abuse prevention, and security monitoring. You can object at any time (section 8)"],
              ["Legitimate interests (soft opt-in)", "Emailing product news and teaching ideas to people who have an account with us, reminding people who started signing up to finish, and telling people on a free trial when it is about to end. You can refuse at signup, turn it off in your profile, or unsubscribe from any such email at any time"],
              ["Consent", "The Meta advertising cookies and the advertising measurement events described in section 9. You can withdraw consent at any time with the Cookie settings link in section 9 of this policy or at the foot of our home page"],
              ["Legal obligation", "Compliance with UK tax, accounting, and data protection law"],
            ]} />
          </Section>

          <Section title="5. Sharing Your Data">
            <p>We share personal data only with trusted third parties needed to deliver the service:</p>
            {/* From app/lib/legal/sub-processors.ts, which the schools trust page
                reads too, so the two can never name different providers. */}
            <Table rows={SUB_PROCESSORS.map((p): [string, string] => [p.name, p.purpose])} />
            <p>We do not sell your personal data. We do not share it with third parties for their own marketing purposes. Meta receives data about you only if you accept advertising cookies (section 9).</p>
          </Section>

          <Section title="6. AI and Your Content">
            <p>When you use Jooma&apos;s AI features, your prompts and inputs are sent to one of our model providers for processing. Depending on the feature, that provider is either OpenAI or Anthropic.</p>
            <p>OpenAI does not use API data to train its models by default, and Anthropic&apos;s commercial terms state that it does not train models on customer content submitted through its API. We encourage you to review <a href="https://openai.com/privacy" className="underline" target="_blank" rel="noreferrer">OpenAI&apos;s privacy policy</a> and <a href="https://www.anthropic.com/legal/privacy" className="underline" target="_blank" rel="noreferrer">Anthropic&apos;s privacy policy</a> for full details.</p>
            <p>Do not include sensitive personal data about pupils or third parties in your prompts.</p>
          </Section>

          <Section title="7. Data Retention">
            <p>We retain your account data for as long as your account is active. If you close your account, we will delete or anonymise your personal data within 90 days, except where we are required to retain it for legal or accounting purposes (typically up to 7 years).</p>
            <p>Generated content (slideshows, lesson plans, etc.) is retained until you delete it or close your account. Something you make before signing up is kept for 14 days so you can keep it when you create an account, then deleted.</p>
            <p>Your cookie choice is remembered in your browser for 12 months, after which we ask again. If you reject advertising cookies after accepting them, we delete the Meta identifiers we stored for your account straight away.</p>
          </Section>

          <Section title="8. Your Rights">
            <p>Under UK GDPR you have the right to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Access:</strong> request a copy of the personal data we hold about you.</li>
              <li><strong>Rectification:</strong> ask us to correct inaccurate data.</li>
              <li><strong>Erasure:</strong> ask us to delete your data (&quot;right to be forgotten&quot;).</li>
              <li><strong>Restriction:</strong> ask us to limit how we use your data.</li>
              <li><strong>Portability:</strong> receive your data in a structured, machine-readable format.</li>
              <li><strong>Object:</strong> object to processing based on legitimate interests, and to marketing emails at any time.</li>
              <li><strong>Withdraw consent:</strong> where processing is based on consent, withdraw it at any time. For advertising cookies, use the Cookie settings link in section 9 of this policy or at the foot of our home page.</li>
            </ul>
            <p>To exercise any of these rights, email <a href="mailto:info@jooma.ai" className="underline">info@jooma.ai</a>. We will respond within one month. You also have the right to lodge a complaint with the <a href="https://ico.org.uk" className="underline" target="_blank" rel="noreferrer">Information Commissioner&apos;s Office (ICO)</a>.</p>
          </Section>

          <Section title="9. Cookies and Advertising">
            <p>When you first visit, we ask whether you accept advertising cookies. Accept and Reject are equally easy, and you can change your mind at any time with the <a href="#cookie-settings" className="underline">Cookie settings</a> link here or at the foot of our home page. Rejecting does not stop you signing up, subscribing, or using any feature.</p>
            <p>These are the cookies Jooma uses:</p>
            <Table rows={[
              ["Sign-in cookies", "Keep you signed in. Strictly necessary. Last until you sign out or your session ends"],
              ["jooma_consent", "Remembers your cookie choice. Strictly necessary. 12 months"],
              ["jooma_device", "Lets us limit free trials to one per person, to prevent abuse. Set when a trial starts. 12 months"],
              ["jooma_guest", "Lets you keep something you made before signing up. Set only if you use Jooma before signing up. 14 days"],
              ["jooma_seen", "Signed in only. Notes the day we last recorded your visit, so the \"last visited\" date on your account is updated once a day. 2 days"],
              ["jooma_attr", "Our own first-party cookie, recording the advert campaign or website that brought you to Jooma, so we can count which channels work. Never shared with Meta or anyone else. Not set if you reject advertising cookies, and deleted when you do. 30 days"],
              ["_fbp, _fbc (Meta)", "Advertising measurement, set by the Meta pixel. Only after you accept. Up to 90 days"],
            ]} />
            <p>We also count page views with Vercel Web Analytics, which sets no cookies and does not identify you.</p>
            <p><strong>Advertising measurement with Meta.</strong> If you accept, the Meta pixel loads on our pages, and our servers tell Meta when you sign up, start a trial, make your first resource, subscribe, or make a payment (including renewals and top-ups). Each of these carries a hashed (one-way encrypted) copy of your email address and Meta&apos;s cookie identifiers, and, for some of them, your IP address and browser type, or the amount and currency paid. Hashing is not anonymous: Meta can match it to an account it already holds. Meta uses this to tell us which adverts led to signups and payments, and to show our adverts to people likely to find Jooma useful.</p>
            <p>Meta Platforms Ireland Ltd is a joint controller with us for collecting and sending this data. What Meta then does with it is covered by <a href="https://www.facebook.com/privacy/policy" className="underline" target="_blank" rel="noreferrer">Meta&apos;s privacy policy</a>.</p>
            <p>If you reject, or never choose, the pixel does not load and we send nothing about you to Meta. If you reject after accepting, we stop from that moment and delete the Meta identifiers stored with your account.</p>
          </Section>

          <Section title="10. Security">
            <p>We implement appropriate technical and organisational measures to protect your data, including TLS encryption in transit, row-level security in our database, and access controls on our systems. No system is 100% secure; if you believe your account has been compromised, contact us immediately.</p>
          </Section>

          <Section title="11. International Transfers">
            <p>Some of the service providers named in section 5 (including OpenAI, Anthropic, Twilio SendGrid, Sentry and Meta) are based in or transfer data to the United States and may process data outside the UK/EEA. Where this occurs, we rely on appropriate safeguards such as the UK International Data Transfer Agreement (IDTA), the UK Addendum to the Standard Contractual Clauses, or the UK Extension to the EU-US Data Privacy Framework.</p>
          </Section>

          <Section title="12. Changes to This Policy">
            <p>We may update this Privacy Policy from time to time. We will tell you about material changes by email or by a prominent notice in the app before they take effect, and the date at the top of this page always shows the latest version.</p>
          </Section>

          <Section title="13. Contact">
            <p>
              Jooma Ltd<br />
              Email: <a href="mailto:info@jooma.ai" className="underline">info@jooma.ai</a>
            </p>
          </Section>

        </div>

        <p className="text-xs text-center mt-8" style={{ color: "#7a604a" }}>
          © {new Date().getFullYear()} Jooma Ltd · <a href="/terms" className="underline">Terms of Service</a>
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--j-purple)" }}>{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed" style={{ color: "var(--j-body)" }}>
        {children}
      </div>
    </section>
  );
}

function Table({ rows }: { rows: [string, string][] }) {
  return (
    // overflow-x-auto rather than hidden: on a narrow phone a long value
    // scrolls inside the table instead of being clipped off its edge.
    <div className="rounded-xl overflow-x-auto border" style={{ borderColor: "var(--j-line)" }}>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([label, value], i) => (
            <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "var(--j-tint)" : "var(--j-card)" }}>
              <td className="px-4 py-2.5 font-semibold w-2/5 align-top" style={{ color: "var(--j-purple)" }}>{label}</td>
              <td className="px-4 py-2.5 align-top" style={{ color: "var(--j-body)" }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
