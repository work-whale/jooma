"use client";

import { dismissUntil, type PromptId } from "./prompts";

/*
 * The browser side of the prompt rules: logging (prompt_shown, _clicked,
 * _dismissed) and remembering "Not now" and "once".
 *
 * Snoozes live in localStorage: a per-browser convenience, never a record that
 * must hold. Every read and write is wrapped, so a private window simply shows
 * the prompt again.
 */

const KEY = (id: PromptId, what: string) => `jooma.prompt.${id}.${what}`;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode: shows again next time */
  }
}

export function logPrompt(id: PromptId, kind: "shown" | "clicked" | "dismissed", button?: string): void {
  try {
    void fetch("/api/prompt-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, kind, ...(button ? { button } : {}) }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* logging never breaks the page */
  }
}

export function dismissedUntil(id: PromptId): Date | null {
  const v = read(KEY(id, "until"));
  const t = v ? Date.parse(v) : NaN;
  return Number.isNaN(t) ? null : new Date(t);
}

/** "Not now": hide for the rule's snooze. Logged. */
export function dismissPrompt(id: PromptId, now = new Date()): void {
  const until = dismissUntil(id, now);
  if (until) write(KEY(id, "until"), until.toISOString());
  logPrompt(id, "dismissed");
}

export function shownBefore(id: PromptId): boolean {
  return read(KEY(id, "shown")) === "1";
}

export function markShown(id: PromptId): void {
  write(KEY(id, "shown"), "1");
  logPrompt(id, "shown");
}

/** One pop-up (P2, P3b) per visit: per tab session. */
export function popupShownThisVisit(): boolean {
  try {
    return window.sessionStorage.getItem("jooma.prompt.popup") === "1";
  } catch {
    return false;
  }
}
export function markPopupShown(): void {
  try {
    window.sessionStorage.setItem("jooma.prompt.popup", "1");
  } catch {
    /* ignore */
  }
}
