"use client";

// The school enquiry form.
//
// The field list is the CEO's, in their order: Name, School, Email, Number,
// Number of licences interested in, Where did you hear about Jooma. The last one
// is a dropdown with a free-text escape hatch, because "other" with nowhere to
// type it collects nothing.
//
// School and phone are required here and optional on ContactForm, which is why
// this is a separate component rather than a mode flag: a form whose validation
// changes shape under a boolean is harder to read than two that each state their
// own rules. The check constraint enquiries_school_fields enforces the same pair
// in the database.

import { useState } from "react";
import {
  HEARD_ABOUT_OPTIONS,
  HEARD_ABOUT_OTHER,
  isEmail,
  isPhone,
} from "@/app/lib/enquiry";
import { Field, Honeypot, INPUT_CLASS, INPUT_STYLE } from "./fields";
import { useEnquirySubmit } from "./useEnquirySubmit";
import Sent from "./Sent";

export default function SchoolEnquiryForm({
  heading = true,
  knownName,
  knownEmail,
}: {
  heading?: boolean;
  knownName?: string | null;
  knownEmail?: string | null;
}) {
  const [name, setName] = useState(knownName ?? "");
  const [school, setSchool] = useState("");
  const [email, setEmail] = useState(knownEmail ?? "");
  const [phone, setPhone] = useState("");
  const [licences, setLicences] = useState("");
  const [heard, setHeard] = useState("");
  const [heardOther, setHeardOther] = useState("");
  const [message, setMessage] = useState("");
  const [company, setCompany] = useState("");

  const { busy, error, reference, submit, reset } = useEnquirySubmit();

  const lockedName = Boolean(knownName);
  const lockedEmail = Boolean(knownEmail);

  const phoneOk = isPhone(phone);
  const ready =
    name.trim() !== "" &&
    school.trim() !== "" &&
    isEmail(email) &&
    phoneOk;

  if (reference !== null) {
    return (
      <Sent
        reference={reference}
        email={email.trim()}
        onAgain={() => {
          setMessage("");
          setLicences("");
          setHeard("");
          setHeardOther("");
          reset();
        }}
      />
    );
  }

  return (
    <div className="max-w-xl">
      {heading && (
        <>
          <h3 className="text-xl font-medium mb-1">School enquiry</h3>
          <p className="text-sm font-light mb-5" style={{ color: "var(--j-muted)" }}>
            Tell us about your school and we will come back with pricing and a
            walkthrough, usually within a working day.
          </p>
        </>
      )}

      {error && (
        <p className="text-sm mb-3" role="alert" style={{ color: "#B3261E" }}>
          {error}
        </p>
      )}

      <Field label="Name" htmlFor="school-name">
        <input
          id="school-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          readOnly={lockedName}
          maxLength={120}
          autoComplete="name"
          placeholder="Priya Shah"
          className={`${INPUT_CLASS} ${lockedName ? "cursor-not-allowed" : ""}`}
          style={{
            ...INPUT_STYLE,
            ...(lockedName ? { backgroundColor: "var(--j-tint)" } : {}),
          }}
        />
      </Field>

      <Field label="School" htmlFor="school-school">
        <input
          id="school-school"
          value={school}
          onChange={(e) => setSchool(e.target.value)}
          maxLength={160}
          autoComplete="organization"
          placeholder="Northgate Primary School"
          className={INPUT_CLASS}
          style={INPUT_STYLE}
        />
      </Field>

      <Field label="Email" htmlFor="school-email">
        <input
          id="school-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          readOnly={lockedEmail}
          maxLength={200}
          autoComplete="email"
          placeholder="you@school.sch.uk"
          className={`${INPUT_CLASS} ${lockedEmail ? "cursor-not-allowed" : ""}`}
          style={{
            ...INPUT_STYLE,
            ...(lockedEmail ? { backgroundColor: "var(--j-tint)" } : {}),
          }}
        />
      </Field>

      <Field
        label="Number"
        htmlFor="school-phone"
        hint={
          phone.trim() !== "" && !phoneOk
            ? "That does not look like a phone number."
            : "So we can call you back if that is easier."
        }
      >
        <input
          id="school-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          maxLength={40}
          autoComplete="tel"
          placeholder="020 7946 0958"
          className={INPUT_CLASS}
          style={INPUT_STYLE}
        />
      </Field>

      <Field
        label="Number of licences interested in"
        htmlFor="school-licences"
        optional
        hint="A rough number is fine. One per teacher who would use it."
      >
        <input
          id="school-licences"
          type="text"
          // A numeric keypad without type="number"'s spinner, which a scroll
          // or a swipe can silently change. The server validates the range.
          inputMode="numeric"
          pattern="[0-9]*"
          value={licences}
          onChange={(e) => setLicences(e.target.value.replace(/\D/g, ""))}
          placeholder="25"
          className={INPUT_CLASS}
          style={INPUT_STYLE}
        />
      </Field>

      <Field label="Where did you hear about Jooma" htmlFor="school-heard" optional>
        <select
          id="school-heard"
          value={heard}
          onChange={(e) => setHeard(e.target.value)}
          className={INPUT_CLASS}
          style={INPUT_STYLE}
        >
          <option value="">Select an option</option>
          {HEARD_ABOUT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      {heard === HEARD_ABOUT_OTHER && (
        <Field label="Where did you hear about us" htmlFor="school-heard-other">
          <input
            id="school-heard-other"
            value={heardOther}
            onChange={(e) => setHeardOther(e.target.value)}
            maxLength={120}
            placeholder="A trust-wide newsletter"
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          />
        </Field>
      )}

      <Field label="Anything else" htmlFor="school-message" optional>
        <textarea
          id="school-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          maxLength={5000}
          placeholder="Which year groups, what you are hoping to solve, when you are looking to start."
          className={`${INPUT_CLASS} resize-none`}
          style={INPUT_STYLE}
        />
      </Field>

      <Honeypot value={company} onChange={setCompany} />

      <button
        type="button"
        onClick={() =>
          void submit({
            kind: "school",
            name: name.trim(),
            school: school.trim(),
            email: email.trim(),
            phone: phone.trim(),
            licences: licences.trim(),
            heard_about: heard,
            heard_other: heard === HEARD_ABOUT_OTHER ? heardOther.trim() : "",
            message: message.trim(),
            company,
          })
        }
        disabled={busy || !ready}
        className="px-5 py-2.5 rounded-2xl text-sm font-semibold text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        style={{ backgroundColor: "var(--j-purple)" }}
      >
        {busy ? "Sending…" : "Send enquiry"}
      </button>
    </div>
  );
}
