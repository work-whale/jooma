import { test, expect } from "@playwright/test";
import {
  ageOn,
  codeProblem,
  normaliseAmbassadorCode,
  normaliseHandle,
  normaliseSortCode,
  validateApplication,
  validateChannels,
  validatePayout,
  validatePersonal,
  validateTax,
  validateAboutYou,
  personalFromAccount,
  isMobile,
  TAX_STATUS,
  type ApplicationInput,
} from "@/app/lib/ambassador-application";

/*
 * The ambassador application form's rules.
 *
 * The same functions run in the browser on each step and in the apply route, so
 * these are the messages a teacher sees and the gate the database relies on.
 */

const NOW = new Date("2026-10-14T12:00:00Z");

const good = (): ApplicationInput => ({
  personal: {
    first_name: "Priya",
    last_name: "Raman",
    email: "Priya.Raman@example.co.uk",
    mobile: "07700 900412",
    date_of_birth: "1992-04-18",
    address_line: "42 Hartley Road",
    town: "Leeds",
    postcode: "ls6 2jt",
    school: "",
    teaches: "Year 4",
  },
  channels: {
    instagram: "@priyateaches",
    tiktok: "",
    x_handle: "",
    facebook: "",
    youtube: "",
    linkedin: "",
    reach: "5k_25k",
    note: "",
  },
  payout: {
    payout_method: "bank",
    account_holder: "Priya Raman",
    sort_code: "040075",
    account_number: "1234 5678",
    bank_name: "Monzo Bank Ltd",
    paypal_email: "",
    tax_status: "self_assessment",
    utr: "",
    requested_code: "priya-4k2",
  },
  agreement: { signature_name: "Priya Raman", read: true, tax: true, disclosure: true },
});

test.describe("the code", () => {
  test("is stored uppercase with no spaces", () => {
    expect(normaliseAmbassadorCode(" priya 4k2 ")).toBe("PRIYA4K2");
  });

  test("the examples shown under the field are all valid", () => {
    for (const code of ["PRIYA-4K2", "MRSJONES", "YEAR4MATHS", "MISSKTEACHES"]) {
      expect(codeProblem(code)).toBeNull();
    }
  });

  test("refuses what Stripe or a teacher would trip over", () => {
    expect(codeProblem("")).toMatch(/Choose/);
    expect(codeProblem("AB1")).toMatch(/at least 4/);
    expect(codeProblem("A".repeat(21))).toMatch(/20 characters/);
    expect(codeProblem("MRS_JONES")).toMatch(/letters, numbers and hyphens/);
    expect(codeProblem("1234")).toMatch(/one letter/);
    expect(codeProblem("-JONES")).toMatch(/Start and end/);
  });
});

test.describe("normalisers", () => {
  test("a handle loses the site, the @ and trailing slashes", () => {
    expect(normaliseHandle("@priya")).toBe("priya");
    expect(normaliseHandle("https://www.tiktok.com/@priya/")).toBe("priya");
    expect(normaliseHandle("instagram.com/priya")).toBe("priya");
    expect(normaliseHandle("linkedin.com/in/priya-raman")).toBe("priya-raman");
  });

  test("a sort code is formatted however it was typed", () => {
    expect(normaliseSortCode("040075")).toBe("04-00-75");
    expect(normaliseSortCode("04 00 75")).toBe("04-00-75");
    expect(normaliseSortCode("0400")).toBe("0400");
  });
});

test.describe("each step", () => {
  test("personal needs an adult", () => {
    expect(ageOn("2008-10-15", NOW)).toBe(17);
    expect(ageOn("2008-10-14", NOW)).toBe(18);
    const p = { ...good().personal, date_of_birth: "2010-01-01" };
    expect(validatePersonal(p, NOW).date_of_birth).toMatch(/18 or over/);
  });

  test("channels need at least one account", () => {
    const c = { ...good().channels, instagram: "" };
    expect(validateChannels(c).channels).toMatch(/at least one/);
  });

  test("bank needs a sort code and an 8 digit account", () => {
    const p = { ...good().payout, sort_code: "12", account_number: "123" };
    const e = validatePayout(p);
    expect(e.sort_code).toBeTruthy();
    expect(e.account_number).toBeTruthy();
  });

  test("PayPal needs only the PayPal email, not bank details", () => {
    const p = {
      ...good().payout,
      payout_method: "paypal" as const,
      sort_code: "",
      account_number: "",
      bank_name: "",
      paypal_email: "priya@example.com",
    };
    expect(validatePayout(p)).toEqual({});
    expect(validatePayout({ ...p, paypal_email: "nope" }).paypal_email).toBeTruthy();
  });

  test("a UTR, if given, is 10 digits", () => {
    expect(validatePayout({ ...good().payout, utr: "123" }).utr).toBeTruthy();
    expect(validatePayout({ ...good().payout, utr: "12345 67890" }).utr).toBeUndefined();
  });
});

test.describe("the whole application", () => {
  test("is normalised into what the database stores", () => {
    const r = validateApplication(good(), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload).toMatchObject({
      email: "priya.raman@example.co.uk",
      postcode: "LS6 2JT",
      instagram: "priyateaches",
      tiktok: null,
      sort_code: "04-00-75",
      account_number: "12345678",
      paypal_email: null,
      requested_code: "PRIYA-4K2",
      declarations: { read: true, tax: true, disclosure: true },
    });
  });

  test("PayPal drops any bank details typed before switching", () => {
    const input = good();
    input.payout = { ...input.payout, payout_method: "paypal", paypal_email: "p@example.com" };
    const r = validateApplication(input, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.sort_code).toBeNull();
    expect(r.payload.account_number).toBeNull();
    expect(r.payload.paypal_email).toBe("p@example.com");
  });

  test("cannot be signed without all three declarations", () => {
    const input = good();
    input.agreement.tax = false;
    const r = validateApplication(input, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.declarations).toBeTruthy();
  });
});

/* Commission is declared one way only. The form shows it as fixed text, and the
 * server refuses anything else rather than storing a choice nobody was offered. */
test.describe("tax status", () => {
  test("self assessment is the only accepted value", () => {
    expect(TAX_STATUS).toBe("self_assessment");
    expect(validateTax({ tax_status: "self_assessment", utr: "" })).toEqual({});
    expect(validateTax({ tax_status: "limited_company", utr: "" }).tax_status).toBeTruthy();
    expect(validateTax({ tax_status: "not_sure", utr: "" }).tax_status).toBeTruthy();
  });
});

/* There is no Personal step any more. Name, email and mobile come from the
 * account; the form asks only for what signup does not collect. */
test.describe("details from the account", () => {
  const typed = () => ({
    ...good().personal,
    first_name: "Someone",
    last_name: "Else",
    email: "someone@else.example",
  });

  test("name and email always come from the account, whatever the form sent", () => {
    const p = personalFromAccount(typed(), {
      first_name: "Molly",
      surname: "Trolly",
      email: "molly@example.co.uk",
      mobile: "+447700900412",
    });
    expect(p.first_name).toBe("Molly");
    expect(p.last_name).toBe("Trolly");
    expect(p.email).toBe("molly@example.co.uk");
    expect(p.mobile).toBe("+447700900412");
  });

  test("the typed mobile is used only when the account has no usable one", () => {
    const account = { first_name: "Molly", surname: "Trolly", email: "molly@example.co.uk" };
    expect(personalFromAccount(typed(), { ...account, mobile: "" }).mobile).toBe("07700 900412");
    expect(personalFromAccount(typed(), { ...account, mobile: "GB0893" }).mobile).toBe("07700 900412");
  });

  test("a whole application validates with account details and About you", () => {
    const input = good();
    input.personal = personalFromAccount(
      { ...input.personal, first_name: "", last_name: "", email: "" },
      { first_name: "Priya", surname: "Raman", email: "priya@example.co.uk", mobile: "+447700900412" },
    );
    const r = validateApplication(input, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.email).toBe("priya@example.co.uk");
    expect(r.payload.tax_status).toBe(TAX_STATUS);
    expect(r.payload.utr).toBeNull();
  });

  test("About you checks only its own fields", () => {
    const p = { ...good().personal, first_name: "", email: "", date_of_birth: "", postcode: "" };
    const e = validateAboutYou(p, NOW);
    expect(Object.keys(e).sort()).toEqual(["date_of_birth", "postcode"]);
  });

  test("a mobile with country letters in front is not a number", () => {
    expect(isMobile("GB 0893 123456")).toBe(false);
    expect(isMobile("+44 7700 900412")).toBe(true);
  });
});
