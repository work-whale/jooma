import { test, expect } from "@playwright/test";
import { confirmStep, FOLLOW_ON_KINDS } from "@/app/lib/follow-on";
import { CHUNK_SIZE, MAX_PUPILS } from "@/app/lib/reports/reports";
import { DIFFERENTIATION_BANDS } from "@/app/lib/differentiation";

/*
 * The server's decision on whether a follow-up request is let off the
 * generation count (app/lib/follow-on.ts). Budget: (parents + 1) x cap.
 */

const rows = (n: number, step: string | null) => Array.from({ length: n }, () => step);

const BATCH = FOLLOW_ON_KINDS.reportBatch.cap;
const REDO = FOLLOW_ON_KINDS.reportRedo.cap;
const QUIZ = FOLLOW_ON_KINDS.quizEdit.cap;
const BAND = FOLLOW_ON_KINDS.bandVersion.cap;

test.describe("caps", () => {
  test("a full class's chunks after the first", () => {
    expect(BATCH).toBe(Math.ceil(MAX_PUPILS / CHUNK_SIZE) - 1);
    expect(BATCH).toBe(7);
  });

  test("every band after the first", () => {
    expect(BAND).toBe(DIFFERENTIATION_BANDS.length - 1);
    expect(BAND).toBe(3);
  });
});

test.describe("confirmStep", () => {
  test("no claim is a counted generation, whatever the history", () => {
    expect(confirmStep("report-writer", null, [])).toBeNull();
    expect(confirmStep("report-writer", null, rows(5, null))).toBeNull();
  });

  test("with no parent on record yet, one job's worth is allowed", () => {
    // The parent is still streaming: its row is not written until it ends.
    expect(confirmStep("report-writer", "Report batch", [])).toBe("Report batch");
    expect(confirmStep("report-writer", "Report batch", rows(BATCH - 1, "Report batch"))).toBe("Report batch");
    expect(confirmStep("report-writer", "Report batch", rows(BATCH, "Report batch"))).toBeNull();
  });

  test("each counted generation buys another cap, exactly at the boundary", () => {
    const history = [null, ...rows(2 * BATCH - 1, "Report batch")];
    expect(confirmStep("report-writer", "Report batch", history)).toBe("Report batch");
    expect(confirmStep("report-writer", "Report batch", [...history, "Report batch"])).toBeNull();

    const two = [null, null, ...rows(3 * BATCH - 1, "Report batch")];
    expect(confirmStep("report-writer", "Report batch", two)).toBe("Report batch");
    expect(confirmStep("report-writer", "Report batch", [...two, "Report batch"])).toBeNull();
  });

  test("a whole class of 40 never counts more than once", () => {
    // 8 chunks: chunk 0 counted, 7 follow-ups, all arriving before any row.
    const seen: (string | null)[] = [];
    const decisions = [];
    for (let i = 1; i < MAX_PUPILS / CHUNK_SIZE; i++) {
      const step = confirmStep("report-writer", "Report batch", seen);
      decisions.push(step);
      seen.push(step);
    }
    expect(decisions.every((d) => d === "Report batch")).toBe(true);
  });

  test("quiz add and refine share one budget", () => {
    const history = [null, ...rows(QUIZ, "Quiz add"), ...rows(QUIZ - 1, "Quiz refine")];
    expect(confirmStep("quiz-generator", "Quiz refine", history)).toBe("Quiz refine");
    expect(confirmStep("quiz-generator", "Quiz add", history)).toBe("Quiz add");
    const spent = [...history, "Quiz refine"];
    expect(confirmStep("quiz-generator", "Quiz refine", spent)).toBeNull();
    expect(confirmStep("quiz-generator", "Quiz add", spent)).toBeNull();
  });

  test("one kind's use does not eat another kind's budget", () => {
    const redos = rows(REDO, "Report redo");
    expect(confirmStep("report-writer", "Report redo", redos)).toBeNull();
    expect(confirmStep("report-writer", "Report batch", redos)).toBe("Report batch");
  });

  test("band versions are budgeted per tool's own rows", () => {
    expect(confirmStep("worksheet-generator", "Band version", rows(BAND - 1, "Band version"))).toBe("Band version");
    expect(confirmStep("worksheet-generator", "Band version", rows(BAND, "Band version"))).toBeNull();
    expect(confirmStep("homework-generator", "Band version", [null, ...rows(2 * BAND - 1, "Band version")])).toBe(
      "Band version",
    );
  });

  test("a step the tool never records is refused", () => {
    expect(confirmStep("report-writer", "Deck text", [])).toBeNull();
    expect(confirmStep("report-writer", "Band version", [])).toBeNull();
    expect(confirmStep("quiz-generator", "Report batch", [])).toBeNull();
    expect(confirmStep("lesson-planner", "Band version", [])).toBeNull();
    expect(confirmStep("report-writer", "", [])).toBeNull();
  });

  test("a tagged row never counts as a parent", () => {
    // Only null steps are parents, so a pile of redos buys no batch budget.
    const history = rows(50, "Report redo");
    expect(confirmStep("report-writer", "Report batch", [...history, ...rows(BATCH, "Report batch")])).toBeNull();
  });
});
