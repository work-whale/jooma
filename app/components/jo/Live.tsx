"use client";

// Live mode's two pieces of screen, shared by the Ask Jo panel and the Ask Jo
// page: the warning before a session, because Live spends credit far faster
// than anything else, and the bar while one runs.

import { Loader2, Mic, MicOff, PhoneOff, Radio } from "lucide-react";
import { useCreditMeter } from "@/app/lib/useCreditMeter";
import { liveCreditsPerMinute } from "@/app/lib/live";
import type { LiveState } from "@/app/lib/useLiveCall";
import styles from "./live.module.css";

/** Shown every time, not once: the cost is the point. */
export function LiveConfirm({ onStart, onCancel }: { onStart: () => void; onCancel: () => void }) {
  const meter = useCreditMeter();
  const perMinute = liveCreditsPerMinute();
  const minutes = meter.metered ? Math.floor(meter.remaining / perMinute) : null;
  const empty = minutes !== null && minutes < 1;

  return (
    <div className={styles.confirm} role="dialog" aria-label="Start Live" data-testid="live-confirm">
      <b>
        <Radio aria-hidden="true" /> Talk with Jo live
      </b>
      <p>
        A real conversation: Jo answers as you speak, and you can interrupt. Live uses about{" "}
        <strong>{perMinute} credits a minute</strong>, much more than typing.
      </p>
      {meter.loading ? (
        <p className={styles.muted}>Checking your credits</p>
      ) : minutes !== null ? (
        <p className={styles.muted} data-testid="live-credits">
          You have {meter.remaining.toLocaleString("en-GB")} credits left, about {minutes} {minutes === 1 ? "minute" : "minutes"} of Live.
          Sessions end after 10 minutes.
        </p>
      ) : (
        <p className={styles.muted}>Sessions end after 10 minutes.</p>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={onCancel} data-testid="live-cancel">
          Not now
        </button>
        <button type="button" className={styles.primary} onClick={onStart} disabled={empty} data-testid="live-start">
          Start Live
        </button>
      </div>
    </div>
  );
}

function clock(seconds: number): string {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function LiveBar({
  state,
  elapsed,
  maxSeconds,
  muted,
  onMute,
  onEnd,
}: {
  state: LiveState;
  elapsed: number;
  maxSeconds: number;
  muted: boolean;
  onMute: () => void;
  onEnd: () => void;
}) {
  const left = maxSeconds - elapsed;
  return (
    <div className={styles.bar} data-state={state} data-ending={left <= 60} data-testid="live-bar">
      {state === "connecting" ? (
        <span className={styles.status}>
          <Loader2 className={styles.spin} aria-hidden="true" /> Connecting
        </span>
      ) : (
        <span className={styles.status}>
          <i className={styles.dot} aria-hidden="true" /> Live
          <span className={styles.time} data-testid="live-timer" aria-label={`${clock(left)} left`}>
            {clock(left)}
          </span>
        </span>
      )}
      <button
        type="button"
        className={styles.round}
        onClick={onMute}
        aria-pressed={muted}
        aria-label={muted ? "Unmute" : "Mute"}
        title={muted ? "Unmute" : "Mute"}
        disabled={state !== "live"}
        data-testid="live-mute"
      >
        {muted ? <MicOff /> : <Mic />}
      </button>
      <button type="button" className={styles.end} onClick={onEnd} data-testid="live-end">
        <PhoneOff aria-hidden="true" /> End
      </button>
    </div>
  );
}
