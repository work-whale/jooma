"use client";

// The public contact page: two forms behind a pill switch.
//
// The switch is client state rather than a URL parameter. ?type= still chooses
// which one opens, because the footer and pricing links deep-link into the
// school form, but flipping between them afterwards is not a navigation worth
// putting in the back button's history.
//
// Language rules apply here as they do to every marketing surface: no em dashes,
// and never the two letters this product does not lead with. See
// scripts/check-language.mjs.

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ContactForm from "@/app/components/enquiry/ContactForm";
import SchoolEnquiryForm from "@/app/components/enquiry/SchoolEnquiryForm";
import type { EnquiryKind } from "@/app/lib/enquiry";

const TABS: { id: EnquiryKind; label: string }[] = [
  { id: "contact", label: "Contact us" },
  { id: "school", label: "School enquiry" },
];

export default function ContactView({
  initialKind,
  knownName,
  knownEmail,
}: {
  initialKind: EnquiryKind;
  knownName: string | null;
  knownEmail: string | null;
}) {
  const [kind, setKind] = useState<EnquiryKind>(initialKind);

  return (
    <div
      className="min-h-dvh flex flex-col py-10 px-4"
      style={{ backgroundColor: "var(--j-tint)" }}
    >
      <div className="max-w-2xl mx-auto w-full">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold mb-6 transition-opacity hover:opacity-70"
          style={{ color: "var(--j-purple)" }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Jooma
        </Link>

        <h1
          className="text-3xl md:text-4xl font-bold tracking-tight mb-2"
          style={{ color: "var(--j-purple)" }}
        >
          Get in touch
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--j-muted)" }}>
          We read everything that comes through here and reply from a real
          address, usually within a working day.
        </p>

        {/* Buttons, not links: this swaps a form on the spot rather than
            navigating, so it should not add a history entry. */}
        <div
          className="inline-flex gap-1 p-1 rounded-2xl mb-6"
          style={{ backgroundColor: "var(--j-card)" }}
          role="tablist"
          aria-label="What are you getting in touch about"
        >
          {TABS.map((t) => {
            const active = kind === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setKind(t.id)}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                style={
                  active
                    ? { backgroundColor: "var(--j-purple)", color: "#fff" }
                    : { color: "var(--j-muted)" }
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div
          className="rounded-3xl border p-6 sm:p-8"
          style={{ backgroundColor: "var(--j-card)", borderColor: "var(--j-line)" }}
        >
          {/* Keyed so switching tabs gives a clean form rather than carrying
              half-typed values across two different sets of rules. */}
          {kind === "school" ? (
            <SchoolEnquiryForm
              key="school"
              knownName={knownName}
              knownEmail={knownEmail}
            />
          ) : (
            <ContactForm key="contact" knownName={knownName} knownEmail={knownEmail} />
          )}
        </div>

        <p className="text-xs text-center mt-6" style={{ color: "var(--j-faint)" }}>
          Already have an account? You can also reach us from Help inside Jooma.
        </p>
      </div>
    </div>
  );
}
