// Checks the Offerloop connect loop with fakes: no Chrome, no Hirist, no network.
// Run: npm run connect:test
import type { ApplyResult } from "../application/application.js";
import type { DetailedJob } from "../hirist/getJobDetails.js";
import type { OfferloopClient, QueueStatus, QueuedJob } from "./client.js";
import { outcomeOf, runConnectOnce, type ConnectDeps } from "./connect.js";
import { runNotice } from "./notify.js";

function expect(condition: boolean, message: string): void { if (!condition) throw new Error(message); }

const job = (n: number): QueuedJob => ({ id: `q${n}`, hiristId: String(1000 + n), title: `Role ${n}`, company: "Acme", url: `https://www.hirist.tech/j/role-${1000 + n}` });
const detailed = (q: QueuedJob, type = "HIRIST_DIRECT"): DetailedJob =>
  ({ jobId: q.hiristId, title: q.title, company: q.company, location: "", jobUrl: q.url, description: "x".repeat(120), applicationType: type }) as DetailedJob;

/** A fake Offerloop queue that records reports. */
function fakeOfferloop(jobs: QueuedJob[], remainingToday = 15) {
  const waiting = [...jobs];
  const reports: { id: string; status: QueueStatus; message?: string }[] = [];
  let takes = 0;
  const client: OfferloopClient = {
    hello: async () => ({ queued: waiting.length, remainingToday, dailyLimit: 15 }),
    take: async (want) => {
      takes++;
      return { jobs: waiting.splice(0, Math.min(want, remainingToday)), remainingToday };
    },
    report: async (id, status, message) => void reports.push({ id, status, message }),
    problem: async () => {},
    resumePdf: async () => new Uint8Array(),
  };
  return { client, reports, takes: () => takes };
}

function deps(offerloop: OfferloopClient, results: Record<string, ApplyResult | "throw" | "gone" | "external">): ConnectDeps & { pauses: () => number; applied: string[] } {
  let pauses = 0;
  const applied: string[] = [];
  return {
    offerloop,
    ensureReady: async () => {},
    details: async (q) => (results[q.id] === "gone" ? null : detailed(q, results[q.id] === "external" ? "EXTERNAL_COMPANY" : "HIRIST_DIRECT")),
    apply: async (j, dryRun) => {
      const r = Object.entries(results).find(([id]) => `${1000 + Number(id.slice(1))}` === j.jobId)?.[1];
      if (r === "throw") throw new Error("Target closed");
      applied.push(j.jobId!);
      return dryRun ? { status: "DRY_RUN" } : (r as ApplyResult);
    },
    pause: async () => void pauses++,
    log: () => {},
    pauses: () => pauses,
    applied,
  };
}

// 1. Each result reaches Offerloop with the right status; one job at a time, with pauses between.
{
  const q = fakeOfferloop([job(1), job(2), job(3), job(4), job(5), job(6)]);
  const d = deps(q.client, {
    q1: { status: "APPLIED" },
    q2: { status: "ALREADY_APPLIED" },
    q3: { status: "QUESTIONNAIRE", visibleQuestions: 3 },
    q4: "gone",
    q5: "external",
    q6: "throw",
  });
  const summary = await runConnectOnce(d, { dryRun: false });
  const got = Object.fromEntries(q.reports.map((r) => [r.id, r.status]));
  expect(JSON.stringify(got) === JSON.stringify({ q1: "applied", q2: "already_applied", q3: "needs_input", q4: "failed", q5: "skipped", q6: "needs_input" }), `wrong statuses: ${JSON.stringify(got)}`);
  expect(summary.done === 6 && !summary.stoppedBecause, "should finish all six");
  expect(q.takes() === 7, "live mode takes one job at a time (plus the empty last call)");
  expect(d.pauses() === 5, "pauses between applications, not before the first");
}

// 2. A CAPTCHA stops the batch for the day; nothing after it is touched.
{
  const q = fakeOfferloop([job(1), job(2), job(3)]);
  const d = deps(q.client, { q1: { status: "APPLIED" }, q2: { status: "UNKNOWN", reason: "HUMAN_REQUIRED" }, q3: { status: "APPLIED" } });
  const summary = await runConnectOnce(d, { dryRun: false });
  expect(Boolean(summary.stoppedBecause), "CAPTCHA should stop the run");
  expect(q.reports.length === 2 && !d.applied.includes("1003"), "job 3 must not be attempted");
}

// 3. Logged out: the job goes back to the queue and the run stops.
{
  const q = fakeOfferloop([job(1), job(2)]);
  const d = deps(q.client, { q1: { status: "AUTH_REQUIRED" }, q2: { status: "APPLIED" } });
  const summary = await runConnectOnce(d, { dryRun: false });
  expect(q.reports[0]?.status === "requeue" && q.reports.length === 1, "logged-out job is put back, nothing else tried");
  expect(Boolean(summary.stoppedBecause), "should stop");
}

// 4. Dry run: everything is looked at, nothing submitted, all put back.
{
  const q = fakeOfferloop([job(1), job(2)]);
  const d = deps(q.client, { q1: { status: "APPLIED" }, q2: { status: "APPLIED" } });
  await runConnectOnce(d, { dryRun: true });
  expect(q.reports.every((r) => r.status === "requeue") && q.reports.length === 2, "dry run puts every job back");
  expect(d.pauses() === 0, "no waiting in a dry run");
}

// 5. Nothing waiting / limit used up: Chrome isn't even touched.
{
  let touched = false;
  const empty = deps(fakeOfferloop([]).client, {});
  empty.ensureReady = async () => void (touched = true);
  await runConnectOnce(empty, { dryRun: false });
  const full = deps(fakeOfferloop([job(1)], 0).client, {});
  full.ensureReady = async () => void (touched = true);
  await runConnectOnce(full, { dryRun: false });
  expect(!touched, "no Chrome work when there's nothing to do");
}

// 6. Result mapping.
expect(outcomeOf({ status: "UNKNOWN", reason: "EXTERNAL_REDIRECT" }).status === "skipped", "external redirect → skipped");
expect(outcomeOf({ status: "UNKNOWN", reason: "DIRECT_CONTROL_MISSING" }).status === "failed", "no Apply button → failed");
expect(outcomeOf({ status: "UNKNOWN", reason: "UNKNOWN_POST_CLICK" }).status === "needs_input", "unclear after click → needs input");
expect(Boolean(outcomeOf({ status: "UNKNOWN", reason: "PROFILE_INCOMPLETE" }).stop), "incomplete profile stops the run");

// 7. The Windows pop-up's text.
{
  const r = (company: string, status: QueueStatus) => ({ title: "Role", company, status });
  const mixed = runNotice({ results: [r("Tredence", "applied"), r("KreditBee", "applied"), r("AuxoAI", "needs_input"), r("Acme", "requeue")] });
  expect(mixed?.title === "Applied to 2 Hirist jobs", `title: ${mixed?.title}`);
  expect(mixed?.lines[0] === "Applied: Tredence, KreditBee", `line: ${mixed?.lines[0]}`);
  expect(mixed?.lines[1] === "Finish on Hirist: AuxoAI", `line: ${mixed?.lines[1]}`);
  expect(runNotice({ results: [r("AuxoAI", "needs_input")] })?.title === "1 job needs you", "needs-you title");
  expect(runNotice({ results: [] }) === null, "nothing done → no pop-up");
  expect(runNotice({ results: [r("Acme", "requeue")] }) === null, "dry run → no pop-up");
  const many = runNotice({ results: ["A", "B", "C", "D", "E", "F"].map((c) => r(c, "applied")) });
  expect(many?.lines[0] === "Applied: A, B, C, D +2 more", `long list: ${many?.lines[0]}`);
}

// 8. Tailored resumes: each tailored job gets its own resume on the profile before Apply; a job
//    without one gets the main resume back first; the main one is always back at the end.
{
  const tailored = (n: number): QueuedJob => ({ ...job(n), tailoredResume: true });
  const q = fakeOfferloop([tailored(1), tailored(2), job(3), tailored(4)]);
  const d = deps(q.client, { q1: { status: "APPLIED" }, q2: { status: "APPLIED" }, q3: { status: "APPLIED" }, q4: { status: "APPLIED" } });
  const events: string[] = [];
  const apply = d.apply;
  d.apply = async (j, dry) => (events.push(`apply ${j.jobId}`), apply(j, dry));
  d.resume = { put: async (j) => void events.push(`put ${j.id}`), restore: async () => void events.push("restore") };
  const summary = await runConnectOnce(d, { dryRun: false });
  expect(
    events.join(", ") === "put q1, apply 1001, put q2, apply 1002, restore, apply 1003, put q4, apply 1004, restore",
    `order: ${events.join(", ")}`,
  );
  expect(q.reports[0]!.message!.includes("tailored to this job") && !q.reports[2]!.message!.includes("tailored"), "the result says which resume went");
  expect(!summary.stoppedBecause, "no stop");
}

// 9. A tailored resume that won't upload: main resume back, then apply with it, and say so.
{
  const q = fakeOfferloop([{ ...job(1), tailoredResume: true }, { ...job(2), tailoredResume: true }]);
  const d = deps(q.client, { q1: { status: "APPLIED" }, q2: { status: "APPLIED" } });
  const events: string[] = [];
  d.resume = {
    put: async (j) => {
      if (j.id === "q2") throw new Error("Hirist answered 500");
      events.push(`put ${j.id}`);
    },
    restore: async () => void events.push("restore"),
  };
  await runConnectOnce(d, { dryRun: false });
  expect(events.join(", ") === "put q1, restore", `order: ${events.join(", ")}`);
  expect(q.reports[1]!.status === "applied" && /couldn't be uploaded \(Hirist answered 500\)/.test(q.reports[1]!.message!), `note: ${q.reports[1]!.message}`);
}

// 10. If the main resume can't be put back before a job, stop rather than send the wrong resume.
{
  const q = fakeOfferloop([{ ...job(1), tailoredResume: true }, job(2), job(3)]);
  const d = deps(q.client, { q1: { status: "APPLIED" }, q2: { status: "APPLIED" }, q3: { status: "APPLIED" } });
  d.resume = { put: async () => {}, restore: async () => { throw new Error("upload button gone"); } };
  const summary = await runConnectOnce(d, { dryRun: false });
  expect(d.applied.join() === "1001", `only job 1 applied: ${d.applied.join()}`);
  expect(q.reports[1]!.status === "requeue", "job 2 goes back to the queue");
  expect(/upload button gone/.test(summary.stoppedBecause ?? ""), `stops with the reason: ${summary.stoppedBecause}`);
}

// 11. Not set up: tailored jobs go with the profile resume, and the result says how to turn it on.
{
  const q = fakeOfferloop([{ ...job(1), tailoredResume: true }]);
  const d = deps(q.client, { q1: { status: "APPLIED" } });
  await runConnectOnce(d, { dryRun: false });
  expect(q.reports[0]!.status === "applied" && q.reports[0]!.message!.includes("resume:setup"), `hint: ${q.reports[0]!.message}`);
}

// 12. A crash mid-way still puts the main resume back.
{
  const q = fakeOfferloop([{ ...job(1), tailoredResume: true }]);
  const d = deps(q.client, { q1: "throw" });
  const events: string[] = [];
  d.resume = { put: async () => void events.push("put"), restore: async () => void events.push("restore") };
  await runConnectOnce(d, { dryRun: false });
  expect(events.join() === "put,restore", `restored after a crash: ${events.join()}`);
}

console.log("Offerloop connect checks passed.");
