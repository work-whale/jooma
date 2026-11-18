import { test, expect } from "@playwright/test";
import { eventEmails, type LoggedEvent } from "@/app/lib/lifecycle";

/*
 * E12, E13 and E14 (spec Step 6): sent by an event, not a date. The webhook
 * logs the event; the cron sends the email, so the quiet hours, the lock and
 * the LIFECYCLE_EMAILS switch live in one place.
 *
 * Edge cases: each event maps to its email; the key is per event, so a second
 * subscription months later gets its own E12 but a retry does not; nothing in
 * quiet hours (it waits for 07:00); an event more than 12 hours old is
 * dropped, never sent late; E14 is not sent once the card has been fixed;
 * other events send nothing.
 */

const at = (iso: string) => new Date(iso);
const ev = (id: number, name: string, createdAt: string): LoggedEvent => ({ id, name, createdAt: at(createdAt) });
const noon = at("2026-11-18T12:00:00Z");

test("each event maps to its email, keyed per event", () => {
  const due = eventEmails(
    [ev(1, "subscribed", "2026-11-18T11:50:00Z"), ev(2, "cancelled", "2026-11-18T11:55:00Z"), ev(3, "payment_failed", "2026-11-18T11:58:00Z")],
    new Set(),
    noon,
    { paymentFailing: true },
  );
  expect(due).toEqual([
    { id: "E12", key: "E12:1", kind: "account", eventId: 1 },
    { id: "E13", key: "E13:2", kind: "account", eventId: 2 },
    { id: "E14", key: "E14:3", kind: "account", eventId: 3 },
  ]);
});

test("already sent is not sent again; a later event gets its own", () => {
  const due = eventEmails(
    [ev(1, "subscribed", "2026-11-18T11:50:00Z"), ev(9, "subscribed", "2026-11-18T11:59:00Z")],
    new Set(["E12:1"]),
    noon,
    { paymentFailing: false },
  );
  expect(due.map((d) => d.key)).toEqual(["E12:9"]);
});

test("nothing in quiet hours", () => {
  const night = at("2026-11-18T22:30:00Z");
  expect(eventEmails([ev(1, "subscribed", "2026-11-18T22:20:00Z")], new Set(), night, { paymentFailing: false })).toEqual([]);
});

test("more than 12 hours late is dropped", () => {
  const due = eventEmails([ev(1, "subscribed", "2026-11-17T23:00:00Z")], new Set(), noon, { paymentFailing: false });
  expect(due).toEqual([]);
});

test("E14 is not sent once the card is fixed", () => {
  const due = eventEmails([ev(3, "payment_failed", "2026-11-18T11:58:00Z")], new Set(), noon, { paymentFailing: false });
  expect(due).toEqual([]);
});

test("other events send nothing", () => {
  expect(eventEmails([ev(4, "resource_made", "2026-11-18T11:58:00Z")], new Set(), noon, { paymentFailing: true })).toEqual([]);
});
