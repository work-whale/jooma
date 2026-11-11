import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { sheetContext } from "@/app/lib/sheets/context";
import { normalizeDraft } from "@/app/lib/sheets/normalize";
import { sheetOutline, sheetToMarkdown } from "@/app/lib/sheets/markdown";
import { buildSheetDocx } from "@/app/lib/sheets/docx";
import { PROFILE_LIST_FIELDS } from "@/app/lib/sheets/pupil-profile";
import { pupilProfileRequest, pupilProfileResponseFormat, type PupilProfileRequest } from "@/app/lib/pupil-profile-prompt";
import { sheetSnapshot } from "@/app/lib/jo/sheet-ops";
import { payloadStrings } from "@/app/lib/reports/privacy";
import type { SheetDoc, TwoColBlock } from "@/app/lib/sheets/types";

/*
 * One Page Profile as a sheet: the pupil's own voice in paired boxes, an
 * empty photo frame, and the dates and support links built from the form and
 * never sent. Pure; nothing reaches a model.
 */

const MODEL: Record<string, string[]> = Object.fromEntries(PROFILE_LIST_FIELDS.map((f) => [f, [`I ${f} [PUPIL]`]]));

const profileFor = (draft: unknown = MODEL): SheetDoc =>
  normalizeDraft(
    draft,
    sheetContext("pupilProfile", {
      yearGroup: "Year 4",
      pupil: { name: "Priya", pronouns: "she" },
      pupilFacts: [{ label: "Last updated", value: "11 November 2026" }, { label: "Review date", value: "" }],
      pupilLinks: [{ label: "Intervention groups", value: "Speech and Language group" }, { label: "Outside agency input", value: "CAMHS" }],
    }),
  );

test.describe("arranging the profile", () => {
  test("dates, the boxes about me, then the links; titled with [PUPIL]", () => {
    const d = profileFor();
    expect(d.title).toBe("[PUPIL]'s one page profile");
    expect(d.sections.map((s) => s.role ?? "")).toEqual(["details", "", "links"]);
    const boxes = d.sections[1].blocks as TwoColBlock[];
    expect(boxes.map((b) => [b.left.title, b.right.title])).toEqual([
      ["What people like and admire about me", "What makes me happy"],
      ["What I find difficult", "How to support me"],
      ["Other strategies that may help me", "Changes to lessons that help me"],
      ["My hopes for the future", ""],
    ]);
  });

  test("without professional suggestions, that box is left out rather than empty", () => {
    const d = profileFor({ ...MODEL, strategies: [], accommodations: [] });
    expect((d.sections[1].blocks as TwoColBlock[]).map((b) => b.left.title)).not.toContain("Other strategies that may help me");
  });

  test("the page reads with the name; the dates have no heading; the links are kept", () => {
    const d = profileFor();
    expect(sheetOutline(d)).toBe("# Priya's one page profile\n## All about me\n## Links to additional support");
    const md = sheetToMarkdown(d);
    expect(md).toContain("I likes Priya");
    expect(md).toContain("**Intervention groups:** Speech and Language group");
    expect(md).not.toContain("[PUPIL]");
  });

  test("the photo box, dates and links can each be switched off", () => {
    const d = profileFor();
    const md = sheetToMarkdown({ ...d, design: { ...d.design, hidden: ["links", "details"] } });
    expect(md).not.toContain("CAMHS");
    expect(md).not.toContain("Last updated");
  });

  test("Word has the photo frame beside the title, and drops it when switched off", async () => {
    const xml = async (doc: SheetDoc) => (await JSZip.loadAsync(await (await buildSheetDocx(doc)).arrayBuffer())).file("word/document.xml")!.async("string");
    const d = profileFor();
    const on = await xml(d);
    expect(on).toContain(">PHOTO<");
    // Word escapes the apostrophe.
    expect(on).toContain("Priya&apos;s one page profile");
    expect(await xml({ ...d, design: { ...d.design, hidden: ["photo"] } })).not.toContain(">PHOTO<");
  });

  test("Jo's copy has no name, no dates and no links", () => {
    const all = payloadStrings(sheetSnapshot(profileFor())).join(" ");
    expect(all).not.toContain("Priya");
    expect(all).not.toContain("CAMHS");
    expect(all).not.toContain("Last updated");
    expect(all).toContain("[PUPIL]");
  });
});

test.describe("the request", () => {
  const body: PupilProfileRequest = { yearGroup: "Year 4", pronouns: "she", likes: "[PUPIL] is kind", supportNeeds: "Reading" };
  const text = (r: ReturnType<typeof pupilProfileRequest>) => ("error" in r ? "" : r.messages.map((m) => m.content).join("\n"));

  test("refuses a name, intervention or agency field; they stay in the browser", () => {
    for (const key of ["name", "studentName", "firstName", "pupil"]) {
      expect(pupilProfileRequest({ ...body, [key]: "Priya" } as PupilProfileRequest), key).toEqual({ error: expect.stringContaining("never sent") });
    }
  });

  test("refuses a request missing the year, the likes or the needs", () => {
    for (const missing of ["yearGroup", "likes", "supportNeeds"] as const) {
      expect(pupilProfileRequest({ ...body, [missing]: "" })).toEqual({ error: "Missing required fields" });
    }
  });

  test("asks for the pupil's own voice, and for professional points only when ticked", () => {
    expect(text(pupilProfileRequest(body))).toContain("in the pupil's own voice");
    expect(text(pupilProfileRequest(body))).toContain("3 or 4 further evidence-based strategies");
    expect(text(pupilProfileRequest({ ...body, includeAdditionalSupport: false }))).toContain("leave both as empty lists");
  });

  test("no long dashes in what the model is told; the schema is strict", () => {
    expect(text(pupilProfileRequest({ ...body, hopes: "x", happy: "y", supportStyle: "z" }))).not.toMatch(/[–—]/);
    const schema = pupilProfileResponseFormat().json_schema.schema as { required: string[]; additionalProperties: boolean };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required.sort()).toEqual([...PROFILE_LIST_FIELDS].sort());
  });
});
