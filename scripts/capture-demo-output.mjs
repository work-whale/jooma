/*
 * Capture REAL Jooma output, for the landing page demos.
 *
 * The landing page shows sample outputs. They must be genuine product output,
 * not hand-written lookalikes, so this drives the real generators and writes
 * what comes back to scratch files you paste into app/lib/landing/demo-content.ts.
 *
 *   node scripts/capture-demo-output.mjs [outDir]
 *
 * Needs a dev server on localhost:3000 and .env.local (Supabase + OpenAI).
 * Every /api/ path is gated by proxy.ts, which 401s an unauthenticated request
 * before the route handler runs, so this creates a throwaway teacher through
 * the service role, signs in through the real login form to get the session
 * cookies the proxy reads, captures, and deletes the teacher again. Same
 * approach as tests/support/users.ts, which this reuses.
 *
 * Costs real generations against whatever .env.local points at. That is
 * STAGING today. Do not point it at production.
 */
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.CAPTURE_BASE_URL ?? "http://localhost:3000";
const OUT = resolve(process.argv[2] ?? "capture-output");

/* The throwaway-teacher rig, mirroring tests/support/users.ts. Inlined rather
 * than imported because that file is TypeScript and this is a plain node
 * script; keep the two in step if the profiles shape changes. */

/** .env.local by hand: node does not load it, and the \r strip matters on
 *  Windows where the file has CRLF endings. */
function loadEnv() {
  let contents;
  try {
    contents = readFileSync(".env.local", "utf8");
  } catch {
    throw new Error("No .env.local. This needs the Supabase URL, anon key and service role key.");
  }
  for (const raw of contents.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

async function createTeacher(firstName) {
  const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const teacher = {
    id: "",
    email: `e2e-${firstName.toLowerCase()}-${tag}@jooma.test`,
    password: `Pw-${tag}-Aa1!`,
    firstName,
    surname: "Testcase",
    username: `e2e${firstName.toLowerCase()}${tag}`.slice(0, 20),
  };
  const { data, error } = await admin.auth.admin.createUser({
    email: teacher.email,
    password: teacher.password,
    email_confirm: true,
  });
  if (error) throw new Error(`Could not create ${firstName}: ${error.message}`);
  teacher.id = data.user.id;

  // The profile gate in proxy.ts 403s a profile-less account, so seed it the
  // way /complete-profile would.
  const { error: profileError } = await admin.from("profiles").upsert({
    id: teacher.id,
    first_name: teacher.firstName,
    surname: teacher.surname,
    username: teacher.username,
  });
  if (profileError) throw new Error(`Could not write the profile: ${profileError.message}`);
  return teacher;
}

async function deleteTeacher(teacher) {
  if (!teacher?.id) return;
  await admin.auth.admin.deleteUser(teacher.id).catch(() => {});
}

/**
 * Put the throwaway teacher on a paid plan.
 *
 * Free accounts get ONE generation a day, so without this the second capture
 * onwards 402s. Comped rather than pretend-paying: no Stripe ids, which is how
 * the admin console tells a comp from a real subscription (see setPlan in
 * tests/support/users.ts). The account is deleted minutes later regardless.
 */
async function compToMax(teacher) {
  const { error } = await admin
    .from("profiles")
    .update({
      plan: "max",
      subscription_status: "active",
      stripe_customer_id: null,
      stripe_subscription_id: null,
      cancel_at_period_end: false,
    })
    .eq("id", teacher.id);
  if (error) throw new Error(`Could not lift the generation cap: ${error.message}`);
}

/** Sign in through the real login form, so the session cookies the proxy reads
 *  are set exactly as a browser would set them. Waits on the submit button
 *  becoming enabled, which is the real proof React has hydrated. */
async function signIn(page, teacher) {
  await page.goto("/login");
  const email = page.locator("#email");
  const password = page.locator("#password");
  const submit = page.getByRole("button", { name: /^sign in$/i });
  await submit.waitFor({ state: "visible" });
  await email.fill(teacher.email);
  await password.fill(teacher.password);
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /^sign in$/i.test(x.textContent.trim()));
    return b && !b.disabled;
  });
  await submit.click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

/** The DfE KS2 reading content domains, exactly as ComprehensionForm sends
 *  them: "code – description". */
const KS2 = {
  "2a": "Give and explain the meaning of words in context",
  "2b": "Retrieve and record information, and identify key details from fiction and non-fiction",
  "2c": "Summarise main ideas from more than one paragraph",
  "2d": "Make inferences from the text and explain and justify inferences with evidence from the text",
  "2g": "Identify and explain how meaning is enhanced through choice of words and phrases",
};
const domains = (codes) => codes.map((c) => `${c} – ${KS2[c]}`);

const CURRICULUM = "2014 National Curriculum";

/**
 * The topics behind the hero's suggestion chips.
 *
 * One per chip, because the chips claim to change the output: pressing
 * "Ancient Egypt, Year 5" and getting a water cycle slide back is the kind of
 * small lie that makes a teacher doubt the rest of the page. The first is the
 * default the hero loads with.
 *
 * `objective` feeds the worksheet generator, `domains` the comprehension one
 * (subject specific: a maths text is not assessed on inference the way a
 * narrative is).
 */
const TOPICS = [
  {
    key: "water-cycle",
    topic: "The water cycle",
    year: "Year 4",
    subject: "Science",
    objective: "Describe the stages of the water cycle",
    domains: ["2a", "2b", "2d"],
  },
  {
    key: "fractions",
    topic: "Equivalent fractions",
    year: "Year 4",
    subject: "Maths",
    objective: "Recognise and show families of common equivalent fractions",
    domains: ["2a", "2b", "2c"],
  },
  {
    key: "egypt",
    topic: "Ancient Egypt",
    year: "Year 5",
    subject: "History",
    objective: "Explain how the River Nile shaped life in Ancient Egypt",
    domains: ["2a", "2b", "2d"],
  },
  {
    key: "persuasive",
    topic: "Persuasive writing",
    year: "Year 6",
    subject: "English",
    objective: "Use rhetorical devices to persuade a reader",
    domains: ["2a", "2d", "2g"],
  },
];

/**
 * POST from inside the signed-in page, so the browser attaches the session
 * cookies the proxy checks. Streaming routes send plain text; the slideshow
 * sends NDJSON. Both are returned whole.
 */
async function capture(page, label, path, body) {
  process.stdout.write(`  ${label} ... `);
  const started = Date.now();
  const result = await page.evaluate(
    async ([path, body]) => {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        return { ok: false, status: res.status, text: (await res.text()).slice(0, 500) };
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let out = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        out += dec.decode(value, { stream: true });
      }
      return { ok: true, text: out };
    },
    [path, body],
  );

  if (!result.ok) {
    console.log(`FAILED ${result.status}`);
    console.log(`    ${result.text}`);
    return null;
  }

  const ext = path.includes("slideshow") ? "ndjson" : "md";
  const file = `${OUT}/${label}.${ext}`;
  writeFileSync(file, result.text, "utf8");
  console.log(`${result.text.length} chars, ${((Date.now() - started) / 1000).toFixed(1)}s -> ${label}.${ext}`);
  return result.text;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  console.log(`Capturing into ${OUT}\n`);

  const teacher = await createTeacher("Capture");
  await compToMax(teacher);
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();

  try {
    await signIn(page, teacher);
    console.log("Signed in as the throwaway teacher.\n");

    // Only the default topic needs all three complexity levels: it is the one
    // whose switcher a visitor plays with. The rest need one of each output.
    const only = process.argv[3];

    for (const t of TOPICS) {
      if (only && t.key !== only) continue;
      console.log(`\n${t.topic}, ${t.year} ${t.subject}`);

      const levels = t.key === "water-cycle" ? ["Simple", "Standard", "Challenging"] : ["Standard"];
      for (const complexity of levels) {
        await capture(page, `${t.key}-comprehension-${complexity.toLowerCase()}`, "/api/comprehension-generator", {
          curriculum: CURRICULUM,
          yearGroup: t.year,
          textSource: "generate",
          topic: t.topic,
          passageWordCount: 200,
          contentDomains: domains(t.domains),
          questionTypes: [],
          numQuestions: 2,
          complexity,
          includeAnswerKey: true,
          differentiate: "no",
          differentiationLevels: [],
        });
      }

      await capture(page, `${t.key}-worksheet`, "/api/worksheet-generator", {
        curriculum: CURRICULUM,
        yearGroup: t.year,
        subject: t.subject,
        learningObjective: t.objective,
        questionTypes: [],
        questionCount: 10,
        differentiate: "no",
        differentiationLevels: [],
        outputDetail: "standard",
        additionalInfo: null,
      });

      // The deck. Slowest and most expensive of the set by a wide margin.
      // Field names per RequestBody in the route: `year`, not `yearGroup`;
      // `themeId`, not `theme`. Images are left on `auto` so the capture shows
      // a real deck, but only the text matters for the landing page.
      await capture(page, `${t.key}-slideshow`, "/api/generate-slideshow", {
        topic: t.topic,
        year: t.year,
        slideCount: 6,
        readingLevel: "Same as Year",
        includeObjectives: true,
        includeVocab: false,
        includeAudio: false,
        themeId: "paper",
        artStyle: "watercolor",
        imageSource: "auto",
      });
    }
  } finally {
    await browser.close();
    await deleteTeacher(teacher);
    console.log("\nThrowaway teacher deleted.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
