// Run: node --experimental-strip-types --test scripts/apply-queue.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { claim, DAILY_APPLY_LIMIT, enqueue, hiristIdOf, report, startedToday, trimQueue } from "../src/lib/apply-queue.ts";

let n = 0;
const uid = () => `q${++n}`;
const run = { id: "run1", workflowName: "Apply on Hirist" };
const hiristJob = (id) => ({ id: `Hirist:${id}`, title: `Role ${id}`, company: "Acme", location: "Bangalore", url: `https://www.hirist.tech/j/role-${id}`, source: "Hirist" });
const T0 = new Date("2026-10-18T09:00:00Z");
const later = (minutes) => new Date(T0.getTime() + minutes * 60_000);

test("Hirist id from the job id or the job link", () => {
  assert.equal(hiristIdOf({ id: "Hirist:1671060", url: "" }), "1671060");
  assert.equal(hiristIdOf({ id: "x", url: "https://www.hirist.tech/j/acme-frontend-developer-1671060" }), "1671060");
  assert.equal(hiristIdOf({ id: "Greenhouse:9", url: "https://boards.greenhouse.io/acme/jobs/9" }), null);
});

test("enqueue: only Hirist jobs, no duplicates, at most `max`", () => {
  const queue = [];
  const careers = { id: "Lever:1", title: "SWE", company: "Foo", url: "https://jobs.lever.co/foo/1", source: "Lever" };
  const r = enqueue(queue, [hiristJob(1), careers, hiristJob(2), hiristJob(3)], run, { max: 2, now: T0, uid });
  assert.deepEqual(r.added.map((i) => i.hiristId), ["1", "2"]);
  assert.deepEqual(r.notHirist.map((j) => j.id), ["Lever:1"]);
  assert.equal(queue.length, 2);
  // The same job approved again by a later run isn't queued twice…
  const again = enqueue(queue, [hiristJob(1)], run, { max: 5, now: T0, uid });
  assert.equal(again.added.length, 0);
  assert.equal(again.duplicates.length, 1);
  // …unless the earlier attempt failed.
  queue.find((q) => q.hiristId === "1").status = "failed";
  assert.equal(enqueue(queue, [hiristJob(1)], run, { max: 5, now: T0, uid }).added.length, 1);
});

test("claim hands out oldest first and stops at 15 a day", () => {
  const queue = [];
  for (let i = 0; i < 20; i++) enqueue(queue, [hiristJob(100 + i)], run, { max: 1, now: later(i), uid });
  const first = claim(queue, { now: later(30) });
  assert.equal(first.items.length, DAILY_APPLY_LIMIT);
  assert.equal(first.items[0].hiristId, "100", "oldest first");
  assert.equal(first.remainingToday, 0);
  for (const item of first.items) report(queue, item.id, "applied", undefined, later(40));
  assert.equal(claim(queue, { now: later(60) }).items.length, 0, "limit reached for today");
  assert.equal(startedToday(queue, later(60)), 15);
  // A day later the rest go out.
  assert.equal(claim(queue, { now: later(24 * 60 + 31) }).items.length, 5);
});

test("jobs approved together are applied in the order they were approved", () => {
  const queue = [];
  enqueue(queue, [hiristJob(1), hiristJob(2), hiristJob(3)], run, { max: 5, now: T0, uid });
  assert.deepEqual(claim(queue, { now: T0 }).items.map((i) => i.hiristId), ["1", "2", "3"]);
});

test("requeue and skipped don't use up the day; stale claims are offered again", () => {
  const queue = [];
  enqueue(queue, [hiristJob(1), hiristJob(2), hiristJob(3)], run, { max: 5, now: T0, uid });
  const { items } = claim(queue, { now: T0, want: 3 });
  report(queue, items[0].id, "requeue", "Not logged in to Hirist", T0);
  report(queue, items[1].id, "skipped", "Apply on company site", T0);
  assert.equal(startedToday(queue, T0), 1, "only the still-running one counts");
  // items[2] never reported back: after 30 minutes it's offered again.
  const retry = claim(queue, { now: later(45) });
  assert.deepEqual(retry.items.map((i) => i.hiristId).sort(), ["1", "3"]);
});

test("report only accepts results for jobs in progress", () => {
  const queue = [];
  enqueue(queue, [hiristJob(1)], run, { max: 1, now: T0, uid });
  assert.equal(report(queue, queue[0].id, "applied", undefined, T0), null, "not claimed yet");
  claim(queue, { now: T0 });
  assert.equal(report(queue, queue[0].id, "applied", "Done", T0).status, "applied");
  assert.equal(report(queue, queue[0].id, "failed", "late duplicate", T0), null);
  assert.equal(report(queue, "nope", "applied", undefined, T0), null);
});

test("trimQueue keeps active jobs and the latest finished ones", () => {
  const queue = [];
  for (let i = 0; i < 320; i++) queue.push({ id: `d${i}`, status: "applied", updatedAt: later(i).toISOString() });
  queue.push({ id: "live", status: "queued", updatedAt: T0.toISOString() });
  const kept = trimQueue(queue);
  assert.equal(kept.length, 300);
  assert.ok(kept.some((q) => q.id === "live"));
  assert.ok(kept.some((q) => q.id === "d319") && !kept.some((q) => q.id === "d0"));
});
