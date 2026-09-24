// The browser half of sending: ask the server for one batch at a time until the
// campaign is done. Used by Send now on the Compose tab and by Resume sending
// in History, so the two can never drift apart.

export interface Progress {
  status: string;
  recipients: number;
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
  batch?: number;
}

/**
 * Send what is left of a campaign, reporting after every batch.
 * Resolves with the final progress, or an error message if the server refused.
 */
export async function drainCampaign(
  id: string,
  onProgress: (p: Progress) => void,
): Promise<{ progress: Progress | null; error: string | null }> {
  let last: Progress | null = null;
  for (;;) {
    const res = await fetch("/api/admin/emails/campaigns/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const next = (await res.json().catch(() => ({}))) as Progress & { error?: string };
    if (!res.ok) {
      return {
        progress: last,
        error: `${next.error ?? "Sending stopped."} Resume it from History to send the rest.`,
      };
    }
    last = next;
    onProgress(next);
    // batch 0 with rows pending means another tab holds them: stop rather
    // than spin.
    if (next.status !== "sending" || next.pending === 0 || next.batch === 0) {
      return { progress: next, error: null };
    }
  }
}
