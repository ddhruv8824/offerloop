// Run: node --experimental-strip-types --test scripts/schedule.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { dueSlot, isValidTimeZone, nextOccurrence, previousOccurrence } from "../src/lib/schedule.ts";

const IST = "Asia/Kolkata"; // UTC+5:30, no daylight saving
const at = (iso) => Date.parse(iso);
const iso = (ts) => new Date(ts).toISOString();
const daily9 = { kind: "daily", time: "09:00" };

test("daily: 09:00 IST is 03:30 UTC", () => {
  const now = at("2026-10-10T08:00:00Z"); // 13:30 IST
  assert.equal(iso(previousOccurrence(daily9, now, IST)), "2026-10-10T03:30:00.000Z");
  assert.equal(iso(nextOccurrence(daily9, now, IST)), "2026-10-11T03:30:00.000Z");
});

test("daily: before today's slot, previous is yesterday's", () => {
  const now = at("2026-10-10T02:00:00Z"); // 07:30 IST
  assert.equal(iso(previousOccurrence(daily9, now, IST)), "2026-10-09T03:30:00.000Z");
  assert.equal(iso(nextOccurrence(daily9, now, IST)), "2026-10-10T03:30:00.000Z");
});

test("the local day differs from the UTC day", () => {
  // 00:30 IST on the 11th is still 19:00 UTC on the 10th.
  const early = { kind: "daily", time: "00:30" };
  const now = at("2026-10-10T19:30:00Z"); // 01:00 IST on Oct 11
  assert.equal(iso(previousOccurrence(early, now, IST)), "2026-10-10T19:00:00.000Z");
});

test("weekly: picks the right weekday in the user's timezone", () => {
  const monday = { kind: "weekly", day: "Monday", time: "09:00" };
  const saturday = at("2026-10-10T08:00:00Z"); // Sat 10 Oct 2026
  assert.equal(iso(previousOccurrence(monday, saturday, IST)), "2026-10-05T03:30:00.000Z");
  assert.equal(iso(nextOccurrence(monday, saturday, IST)), "2026-10-12T03:30:00.000Z");
});

test("month and year roll over", () => {
  const now = at("2026-12-31T20:00:00Z"); // 01:30 IST on 1 Jan 2027
  assert.equal(iso(nextOccurrence(daily9, now, IST)), "2027-01-01T03:30:00.000Z");
  assert.equal(iso(previousOccurrence(daily9, now, IST)), "2026-12-31T03:30:00.000Z");
});

test("a timezone with daylight saving still lands on the wall-clock time", () => {
  const ny = "America/New_York";
  assert.equal(iso(nextOccurrence(daily9, at("2026-07-01T00:00:00Z"), ny)), "2026-07-01T13:00:00.000Z"); // EDT, UTC-4
  assert.equal(iso(nextOccurrence(daily9, at("2026-01-15T00:00:00Z"), ny)), "2026-01-15T14:00:00.000Z"); // EST, UTC-5
});

test("due: runs once when the slot passes, never twice for the same slot", () => {
  const savedAt = at("2026-10-09T10:00:00Z");
  const before = at("2026-10-10T03:29:00Z");
  const after = at("2026-10-10T03:30:20Z");
  assert.equal(dueSlot(daily9, { now: before, timeZone: IST, savedAt }), null);
  const slot = dueSlot(daily9, { now: after, timeZone: IST, savedAt });
  assert.equal(iso(slot), "2026-10-10T03:30:00.000Z");
  assert.equal(dueSlot(daily9, { now: after + 30_000, timeZone: IST, savedAt, lastScheduledFor: slot }), null);
});

test("due: saving after today's time waits until tomorrow", () => {
  const savedAt = at("2026-10-10T05:00:00Z"); // saved 10:30 IST, after the 09:00 slot
  assert.equal(dueSlot(daily9, { now: at("2026-10-10T06:00:00Z"), timeZone: IST, savedAt }), null);
  assert.equal(iso(dueSlot(daily9, { now: at("2026-10-11T03:31:00Z"), timeZone: IST, savedAt })), "2026-10-11T03:30:00.000Z");
});

test("due: after days of downtime it catches up once, for the latest slot", () => {
  const savedAt = at("2026-10-01T10:00:00Z");
  const lastScheduledFor = at("2026-10-02T03:30:00Z");
  const now = at("2026-10-10T08:00:00Z"); // server was off for a week
  const slot = dueSlot(daily9, { now, timeZone: IST, savedAt, lastScheduledFor });
  assert.equal(iso(slot), "2026-10-10T03:30:00.000Z");
  assert.equal(dueSlot(daily9, { now, timeZone: IST, savedAt, lastScheduledFor: slot }), null);
});

test("timezone validation", () => {
  assert.equal(isValidTimeZone("Asia/Kolkata"), true);
  assert.equal(isValidTimeZone("Not/AZone"), false);
  assert.equal(isValidTimeZone(undefined), false);
});
