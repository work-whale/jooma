"use client";

import { useState } from "react";
import { createClient } from "@/app/lib/auth/client";
import { Btn, C, Card, CardBody, CardHeader, CardTitle, Note } from "../ui";

/*
 * Jooma 4.5 launch day (spec Step 8): launch_v45_move_accounts().
 *
 *   keep                payers, admins and live paid plans: untouched
 *   trial_runs_out      an old no-card trial still running: runs to its end
 *   free                paid once, nothing live now: moved to Free with 50
 *   free_trial_pending  never paid: moved to Free, and a new 10-day Pro trial
 *                       starts at their next login (PlanPromptsHost)
 *
 * Preview is read-only and is what this card does first. Running it needs the
 * word MOVE typed. Admin only (the function checks is_admin()). Then E16,
 * the launch-day service notice, is previewed and sent below (SEND).
 */

const LABELS: Record<string, string> = {
  keep: "Unchanged (payers, admins, live plans)",
  trial_runs_out: "Old trial still running: moves to Free when it ends",
  free: "Paid before, nothing live: moved to Free with 50",
  free_trial_pending: "Never paid: Free now, 10 days of Pro at next login",
};

type Counts = { move: string; accounts: number }[];

function table(rows: Counts) {
  return (
    <table className="w-full text-sm mt-3">
      <tbody>
        {rows.map((r) => (
          <tr key={r.move} className="border-t" style={{ borderColor: C.divider }}>
            <td className="py-2 pr-3" style={{ color: C.ink }}>
              {LABELS[r.move] ?? r.move}
            </td>
            <td className="py-2 text-right font-semibold tabular-nums" style={{ color: C.ink }}>
              {r.accounts.toLocaleString("en-GB")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function LaunchV45Card() {
  const [preview, setPreview] = useState<Counts | null>(null);
  const [done, setDone] = useState<Counts | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const call = async (apply: boolean) => {
    setBusy(true);
    setError(null);
    const { data, error } = await createClient().rpc("launch_v45_move_accounts", { p_apply: apply });
    setBusy(false);
    if (error) {
      setError(error.code === "PGRST202" ? "The plans engine migration is not on this database yet." : error.message);
      return;
    }
    const rows = ((data ?? []) as { move: string; accounts: number | string }[]).map((r) => ({
      move: r.move,
      accounts: Number(r.accounts),
    }));
    if (apply) {
      setDone(rows);
      setConfirm("");
    } else setPreview(rows);
  };


  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Jooma 4.5 launch day: move existing accounts</CardTitle>
      </CardHeader>
      <CardBody>
        <p className="text-sm" style={{ color: C.muted }}>
          Moves accounts that never paid to Free, with 10 days of Pro waiting for their next login. Payers are not
          touched. Preview first; it changes nothing.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Btn onClick={() => void call(false)} disabled={busy} size="sm">
            Preview
          </Btn>
        </div>
        {preview && table(preview)}
        {preview && !done && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Type MOVE to run it"
              className="text-sm rounded-lg border px-3 py-1.5"
              style={{ borderColor: C.border }}
              aria-label="Type MOVE to run the launch move"
            />
            <Btn variant="primary" size="sm" disabled={busy || confirm !== "MOVE"} onClick={() => void call(true)}>
              Run the move
            </Btn>
          </div>
        )}
        {done && (
          <div className="mt-4">
            <Note>Done. These are the counts the move applied to.</Note>
            {table(done)}
          </div>
        )}
        {error && (
          <p className="text-sm mt-3" role="alert" style={{ color: C.danger }}>
            {error}
          </p>
        )}
        <LaunchNotice />
      </CardBody>
    </Card>
  );
}

type NoticeResult = {
  due: Record<string, number>;
  sent: number;
  failed: number;
  finished: boolean;
};

/** E16, the launch-day service notice: after the move, one email per account
 *  saying what launch day did to it. Preview first; SEND to send. Each account
 *  gets it once, however many times this is pressed. */
function LaunchNotice() {
  const [result, setResult] = useState<NoticeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const call = async (send: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/launch-notice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(send ? { send: true, confirm } : {}),
      });
      const data = (await res.json().catch(() => null)) as (NoticeResult & { error?: string }) | null;
      if (!res.ok || !data) setError(data?.error ?? "Could not reach the notice route.");
      else setResult(data);
    } catch {
      setError("Network error.");
    }
    setBusy(false);
  };

  const total = result ? Object.values(result.due).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="mt-6 pt-5 border-t" style={{ borderColor: C.divider }}>
      <p className="text-sm font-semibold" style={{ color: C.ink }}>
        Then: the launch-day notice (E16)
      </p>
      <p className="text-sm mt-1" style={{ color: C.muted }}>
        A plain service email to every account, saying what launch day did to it. Run the move first. Admins,
        accounts being deleted and new trials are skipped.
      </p>
      <div className="flex flex-wrap gap-2 mt-3">
        <Btn onClick={() => void call(false)} disabled={busy} size="sm">
          Preview the notice
        </Btn>
      </div>
      {result && (
        <>
          {table(
            Object.entries(result.due).map(([move, accounts]) => ({ move, accounts })),
          )}
          {(result.sent > 0 || result.failed > 0) && (
            <Note>
              Sent {result.sent.toLocaleString("en-GB")}, failed {result.failed.toLocaleString("en-GB")}.
              {result.finished ? " All done." : " Stopped for time: press Send again to carry on."}
            </Note>
          )}
          {total > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Type SEND to send it"
                className="text-sm rounded-lg border px-3 py-1.5"
                style={{ borderColor: C.border }}
                aria-label="Type SEND to send the launch notice"
              />
              <Btn variant="primary" size="sm" disabled={busy || confirm !== "SEND"} onClick={() => void call(true)}>
                {busy ? "Sending…" : `Send to ${total.toLocaleString("en-GB")}`}
              </Btn>
            </div>
          )}
        </>
      )}
      {error && (
        <p className="text-sm mt-3" role="alert" style={{ color: C.danger }}>
          {error}
        </p>
      )}
    </div>
  );
}
