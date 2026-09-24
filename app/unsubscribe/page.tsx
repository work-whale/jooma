import UnsubscribeForm from "./UnsubscribeForm";

// Where the footer link of a Jooma bulk email lands. Asks before acting: mail
// security scanners open every link in an email, and a page that unsubscribed
// on load would quietly unsubscribe whole schools.

export const dynamic = "force-dynamic";

export const metadata = { title: "Unsubscribe | Jooma" };

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: "var(--j-tint)" }}
    >
      <div
        className="w-full max-w-md rounded-3xl px-10 py-12 text-center"
        style={{ backgroundColor: "var(--j-card)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo/logo-v2.svg"
          alt="Jooma"
          className="mx-auto mb-7"
          style={{ height: 34, width: "auto" }}
        />
        <UnsubscribeForm token={t ?? ""} />
      </div>
    </div>
  );
}
