// Resume Studio's engine, without an API key: the deterministic core (ids, review
// checks, patching, ATS, extraction, storage), the HTTP API, and the tailoring and
// chat pipelines with the model call scripted.
// Run: pnpm --filter @offerloop/resume-studio test
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, beforeEach, test } from "node:test";
import postgres from "postgres";
import { closeStorage } from "@offerloop/storage";

import { atsScore } from "../src/lib/tailor/ats";
import { applyChanges } from "../src/lib/tailor/patch";
import type { ChatEvent, JdAnalysis, TailorChange, TailorEvent } from "../src/lib/tailor/types";
import { layoutRuns, reflowColumns } from "../src/server/extract";
import { handleRedlineRequest } from "../src/server/handler";
import { LlmConfigError, resolveConfig, type RunOptions } from "../src/server/models";
import { ChatDecision, JDAnalysis, TailorPlan, TailorReview } from "../src/server/schemas";
import { applyReview } from "../src/server/review";
import { cleanMermaid, StudyNotesSchema, writeStudyNotes } from "../src/server/study-notes";
import * as store from "../src/server/store";
import { assignIds, buildMasterProfile } from "../src/server/structure";
import { runChat } from "../src/server/chat";
import { runTailor } from "../src/server/tailor";
import { validateChanges, type ProposedEdit } from "../src/server/validation";

// With TEST_DATABASE_URL (a throwaway Postgres!) the suite runs against the database
// backend instead of files; its Resume Studio rows are wiped before every test.
const testDb = process.env.TEST_DATABASE_URL;
const sql = testDb ? postgres(testDb, { onnotice: () => {} }) : null;
if (testDb) process.env.DATABASE_URL = testDb;
else delete process.env.DATABASE_URL;

// Every test starts with no saved data.
beforeEach(async () => {
  process.env.REDLINE_DATA_DIR = mkdtempSync(path.join(tmpdir(), "redline-test-"));
  if (sql) {
    await store.loadWorkspace("init"); // creates the table on first use
    await sql`delete from offerloop_kv where key like 'redline/%'`;
  }
});

after(async () => {
  await closeStorage();
  await sql?.end();
});

const RAW = {
  contact: { name: "Alex" },
  summary: "Backend developer with Python.",
  experience: [
    {
      company: "Acme",
      title: "SWE",
      start_date: "2022",
      end_date: "Present",
      tools: ["Python", "Docker", "AWS"],
      bullets: ["Built REST APIs in Python serving 2,000 users", "Containerised services with Docker", "Wrote docs"],
    },
  ],
  projects: [{ name: "Bot", tech: ["React"], bullets: ["Made a chat bot"] }],
  skills: ["Python", "Docker"],
  education: [{ institution: "X", degree: "BCA" }],
};
const JD = {
  company: "Beta",
  role_title: "Backend Engineer",
  must_have_skills: ["Python", "AWS", "Kubernetes"],
  nice_to_have_skills: ["Azure"],
  keywords: ["REST APIs", "scalable"],
} as JdAnalysis;

const resume = () => assignIds(structuredClone(RAW));
const master = () => buildMasterProfile(resume());
const validate = (changes: object[], opts?: Parameters<typeof validateChanges>[4]) =>
  validateChanges(changes as ProposedEdit[], resume(), master(), JD, opts);

// ── ids ───────────────────────────────────────────────────────────────────────

test("ids are assigned in code", () => {
  const r = resume();
  assert.equal(r.summary.id, "summary");
  assert.deepEqual(r.experience[0].bullets.map((b) => b.id), ["exp1_b1", "exp1_b2", "exp1_b3"]);
  assert.equal(r.projects[0].bullets[0].id, "proj1_b1");
  assert.equal(r.education[0].id, "edu1");
});

// ── review checks: flag, don't block ──────────────────────────────────────────

test("an unverified skill and number are flagged, not blocked", () => {
  const [ok, skipped] = validate([
    { op: "rewrite_bullet", item_id: "exp1", bullet_id: "exp1_b2", after: "Containerised services with Docker and Kubernetes", reason: "r" },
    { op: "add_bullet", item_id: "exp1", after: "Cut latency by 40%", reason: "r" },
  ]);
  assert.equal(skipped.length, 0);
  assert.match(ok[0].warnings![0], /Kubernetes/);
  assert.match(ok[1].warnings![0], /40/);
});

test("soft phrases are not treated as skills", () => {
  const [ok] = validate([
    {
      op: "rewrite_summary",
      after: "Backend developer building scalable Python APIs with strong client communication.",
      reason: "r",
      keywords_added: ["scalable", "client communication"],
    },
  ]);
  assert.deepEqual(ok[0].warnings, []);
});

test("backed changes have no warnings", () => {
  const [ok] = validate([
    { op: "rewrite_bullet", item_id: "exp1", bullet_id: "exp1_b1", after: "Built Python REST APIs on AWS serving 2000 users", reason: "r", keywords_added: ["AWS"] },
  ]);
  assert.deepEqual(ok[0].warnings, []);
  assert.equal(ok[0].before, "Built REST APIs in Python serving 2,000 users");
});

for (const [change, reason] of [
  [{ op: "rewrite_bullet", item_id: "edu1", bullet_id: "x", after: "y" }, "education"],
  [{ op: "rewrite_bullet", item_id: "exp1", bullet_id: "exp1_b1", company: "Google", after: "y" }, "protected"],
  [{ op: "rewrite_bullet", item_id: "exp1", bullet_id: "nope", after: "y" }, "unknown bullet"],
  [{ op: "teleport", item_id: "exp1" }, "unknown operation"],
  [{ op: "reorder_bullets", item_id: "exp1", new_order: ["exp1_b9"] }, "unknown or duplicate"],
] as const) {
  test(`a change that can't apply is skipped: ${reason}`, () => {
    const [ok, skipped] = validate([{ ...change, reason: "r" }]);
    assert.equal(ok.length, 0);
    assert.ok(skipped[0].rejection_reason.includes(reason), skipped[0].rejection_reason);
  });
}

test("a partial reorder keeps unlisted bullets", () => {
  const [ok] = validate([{ op: "reorder_bullets", item_id: "exp1", new_order: ["exp1_b3"], reason: "r" }]);
  assert.deepEqual(ok[0].new_order, ["exp1_b3", "exp1_b1", "exp1_b2"]);
});

test("a second add across batches is flagged", () => {
  const original = resume();
  const first = applyChanges(original, [
    { op: "add_bullet", item_id: "exp1", new_bullet_id: "exp1_new1", after: "x" } as TailorChange,
  ]);
  const [ok] = validateChanges(
    [{ op: "add_bullet", item_id: "exp1", after: "Documented APIs", reason: "r" }],
    first, master(), JD,
    { original, idPrefix: "e1_", bulletPrefix: "e1n" },
  );
  assert.equal(ok[0].id, "e1_1");
  assert.equal(ok[0].new_bullet_id, "exp1_e1n1");
  assert.match(ok[0].warnings![0], /more than one bullet/);
});

// ── patching + ATS ────────────────────────────────────────────────────────────

test("applying changes is pure and ordered", () => {
  const r = resume();
  const [ok] = validate([
    { op: "rewrite_bullet", item_id: "exp1", bullet_id: "exp1_b1", after: "Built APIs on AWS", reason: "r" },
    { op: "remove_bullet", item_id: "exp1", bullet_id: "exp1_b3", reason: "r" },
    { op: "update_skills", skills_after: ["AWS", "Python", "Docker"], reason: "r" },
  ]);
  const tailored = applyChanges(r, ok);
  assert.deepEqual(tailored.experience[0].bullets.map((b) => b.text), ["Built APIs on AWS", "Containerised services with Docker"]);
  assert.deepEqual(tailored.skills, ["AWS", "Python", "Docker"]);
  assert.equal(r.experience[0].bullets.length, 3); // original untouched
});

test("ATS counts aliases and plurals", () => {
  const r = assignIds({ ...structuredClone(RAW), summary: "Built LLM apps and data pipeline tooling.", skills: ["Python", "K8s"] });
  const jd = {
    must_have_skills: ["Generative AI", "Kubernetes"],
    nice_to_have_skills: ["AI pipelines"],
    keywords: ["data pipelines", "Rust"],
    keyword_aliases: [
      { term: "Generative AI", aliases: ["GenAI", "LLM"] },
      { term: "Kubernetes", aliases: ["K8s"] },
    ],
  } as JdAnalysis;
  const result = atsScore(r, jd);
  assert.ok(result.matched.includes("Generative AI")); // via alias "LLM"
  assert.ok(result.matched.includes("Kubernetes")); // via alias "K8s"
  assert.ok(result.matched.includes("data pipelines")); // plural of "data pipeline"
  assert.ok(result.missing.includes("Rust"));
  assert.deepEqual(result.groups!.must_have_skills, { matched: 2, total: 2 });
});

// ── providers + storage ───────────────────────────────────────────────────────

test("resolveConfig validates its input and keeps the key out of logs", () => {
  delete process.env.OPENAI_API_KEY;
  assert.throws(() => resolveConfig("openai", null, null), LlmConfigError);
  assert.throws(() => resolveConfig("nope", null, "k"), LlmConfigError);
  assert.throws(() => resolveConfig("groq", "a b;c", "k"), LlmConfigError);
  const cfg = resolveConfig("anthropic", null, "sk-ant-x");
  assert.equal(cfg.model, "claude-opus-5");
  assert.equal(cfg.apiKey, "sk-ant-x");
  assert.ok(!JSON.stringify(cfg).includes("sk-ant"));
});

test("storage rejects unsafe workspace ids", async () => {
  await store.saveMasterProfile("default", { notes: "x" } as never);
  assert.deepEqual((await store.loadWorkspace("default")).master_profile, { notes: "x" });
  if (!sql) assert.ok(existsSync(path.join(store.dataDir(), "workspaces", "default", "master_profile.json")));
  for (const bad of ["../etc", "a/b", "", "x".repeat(65)]) {
    await assert.rejects(store.saveMasterProfile(bad, {} as never), RangeError);
  }
  assert.equal(await store.getVersion("default", "../../secret"), null);
});

// ── extraction ────────────────────────────────────────────────────────────────

test("two-column PDF text is read column by column", () => {
  const page = [
    "Jane Doe - Backend engineer who ships reliable systems and clean APIs for real users",
    "   CONTACT              WORK EXPERIENCE",
    "   jane@example.com     Acme Corp                         2023-Present",
    "   SKILLS               Built the billing API in Python.",
    "   Python               Cut deploy time by 50%.",
    "   Docker               Globex                            2021-2023",
    "   Kafka                Worked as a Frontend Engineer on the dashboard.",
    "   PROJECTS",
    "   Shelfie - a book-tracking app with AI recommendations, used by 1,200 readers.",
  ].join("\n");
  const lines = reflowColumns(page).split("\n");
  // each column reads straight through instead of interleaving line by line
  assert.ok(lines.indexOf("Python") < lines.indexOf("Docker") && lines.indexOf("Docker") < lines.indexOf("Kafka"));
  const acme = lines.indexOf("Acme Corp                         2023-Present");
  const globex = lines.indexOf("Globex                            2021-2023");
  assert.ok(acme >= 0 && acme < globex);
  assert.ok(lines[globex + 1].startsWith("Worked as a Frontend Engineer"));
  assert.ok(!lines.some((l) => l.includes("Docker") && l.includes("Globex")));
  // a section heading stays with the full-width text under it
  assert.equal(lines.indexOf("PROJECTS"), lines.findIndex((l) => l.startsWith("Shelfie")) - 1);
});

test("text runs are laid out at their page positions", () => {
  // 5pt glyphs: a run at x=100 starts at column 20.
  const text = layoutRuns([
    { text: "Skills", x: 10, y: 700, width: 30 },
    { text: "Acme Corp", x: 100, y: 701, width: 45 },
    { text: "Python", x: 10, y: 680, width: 30 },
  ]);
  assert.deepEqual(text.split("\n"), ["  Skills            Acme Corp", "  Python"]);
});

// ── HTTP API ──────────────────────────────────────────────────────────────────

const call = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) => {
  const req = new Request(`http://local/api/redline${url}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handleRedlineRequest(req, new URL(req.url).pathname.split("/").slice(3).map(decodeURIComponent));
};

test("API: the sample resume loads into a fresh workspace", async () => {
  const empty = await (await call("GET", "/api/v1/tailor/workspace?workspace=fresh-1")).json();
  assert.equal(empty.current_resume, null);
  assert.deepEqual(empty.versions, []);

  const r = await call("POST", "/api/v1/tailor/resume/sample", { workspace: "fresh-1" });
  assert.equal(r.status, 200);
  const sample = (await r.json()).current_resume;
  assert.equal(sample.contact.name, "Jordan Rivera");
  assert.equal(sample.experience[0].bullets[0].id, "exp1_b1");

  const loaded = await (await call("GET", "/api/v1/tailor/workspace?workspace=fresh-1")).json();
  assert.equal(loaded.current_resume.contact.name, "Jordan Rivera");
  assert.ok(loaded.master_profile.jobs[0].tools.includes("FastAPI"));
  assert.equal((await call("POST", "/api/v1/tailor/resume/sample", { workspace: "../x" })).status, 400);
});

test("API: versions save, list newest first and load", async () => {
  const v = (id: string, updated_at: string) => ({ id, label: id, company: "C", role_title: "R", created_at: updated_at, updated_at });
  await call("POST", "/api/v1/tailor/versions", { workspace: "w", version: v("old", "2026-01-01") });
  const saved = await (await call("POST", "/api/v1/tailor/versions", { workspace: "w", version: v("new", "2026-02-01") })).json();
  assert.deepEqual(saved, v("new", "2026-02-01"));
  const ws = await (await call("GET", "/api/v1/tailor/workspace?workspace=w")).json();
  assert.deepEqual(ws.versions.map((x: { id: string }) => x.id), ["new", "old"]);
  assert.equal((await (await call("GET", "/api/v1/tailor/versions/old?workspace=w")).json()).label, "old");
  assert.equal((await call("GET", "/api/v1/tailor/versions/missing?workspace=w")).status, 404);
  assert.equal((await call("POST", "/api/v1/tailor/versions", { workspace: "w", version: { id: "../x" } })).status, 400);
});

test("API: errors use FastAPI's { detail } shape", async () => {
  delete process.env.GROQ_API_KEY;
  const noKey = await call("POST", "/api/v1/tailor/llm/verify", undefined, { "X-LLM-Provider": "groq" });
  assert.equal(noKey.status, 400);
  assert.match((await noKey.json()).detail, /No API key for Groq/);
  const short = await call("POST", "/api/v1/tailor", { jd_text: "too short", current_resume: {}, master_profile: {} }, { "X-LLM-Key": "k" });
  assert.equal(short.status, 422);
  assert.equal((await call("GET", "/api/v1/nope")).status, 404);
  assert.equal((await call("GET", "/docs")).status, 404);
  const providers = await (await call("GET", "/api/v1/tailor/llm/providers")).json();
  assert.deepEqual(providers.providers.map((p: { id: string }) => p.id), ["gemini", "openai", "anthropic", "groq"]);
});

// ── pipelines, with the model scripted ────────────────────────────────────────

const SECRET = "sk-test-SECRET-KEY-123";
const LLM = resolveConfig("openai", "gpt-4.1-mini", SECRET);

const PIPE_RESUME = assignIds({
  contact: { name: "Alex" },
  summary: "Backend developer with Python.",
  experience: [{ company: "Acme", title: "SWE", tools: ["Python", "AWS"], bullets: ["Built APIs in Python", "Wrote docs"] }],
  skills: ["Python"],
});
const PIPE_MASTER = buildMasterProfile(PIPE_RESUME);
const PIPE_JD = { company: "Beta", role_title: "Backend Engineer", must_have_skills: ["Python", "AWS", "Kubernetes"], nice_to_have_skills: [], keywords: [] };

/** A fake `ask`: returns the next scripted answer for the requested schema. */
function fakeAsk(answers: Map<unknown, object[]>) {
  const calls: unknown[] = [];
  const prompts: Array<{ instructions: string; messages: Array<{ content: unknown }> }> = [];
  const ask = (async (cfg, schema, prompt) => {
    assert.equal(cfg.apiKey, SECRET);
    calls.push(schema);
    prompts.push(prompt as never);
    return schema.parse(answers.get(schema)!.shift());
  }) as NonNullable<RunOptions["ask"]>;
  return { ask, calls, prompts };
}

const collect = async <T>(events: AsyncGenerator<T>) => {
  const out: T[] = [];
  for await (const e of events) out.push(e);
  return out;
};

/** Everything saved (files or database rows), as one string — to check what was saved. */
async function savedData(): Promise<string> {
  if (sql) return (await sql<{ value: string }[]>`select value from offerloop_kv`).map((r) => r.value).join("\n");
  const read = (dir: string): string =>
    readdirSync(dir, { withFileTypes: true })
      .map((e) => (e.isDirectory() ? read(path.join(dir, e.name)) : readFileSync(path.join(dir, e.name), "utf8")))
      .join("\n");
  return read(store.dataDir());
}

test("tailoring runs every step and logs them", async () => {
  const { ask, calls } = fakeAsk(
    new Map<unknown, object[]>([
      [JDAnalysis, [PIPE_JD]],
      [TailorPlan, [{
        summary: { after: "Python developer shipping APIs on AWS.", reason: "r" },
        changes: [{ op: "rewrite_bullet", item_id: "exp1", bullet_id: "exp1_b1", after: "Built APIs in Python on AWS", reason: "r", keywords_added: ["AWS"] }],
        gaps: [{ skill: "Kubernetes", question: "Used Kubernetes?" }, { skill: "Python", question: "dup" }],
      }]],
      // d1 = the bullet rewrite, d2 = the summary
      [TailorReview, [{
        notes: ["Reads as a Python backend developer; Kubernetes is the gap."],
        verdicts: [
          { change: "d1", action: "improve", after: "Built Python APIs deployed on AWS", reason: "Leads with the stack the JD asks for." },
          { change: "d2", action: "keep", reason: "fine" },
        ],
        additions: [],
      }]],
    ]),
  );
  const input = { workspace: "ws1", runId: "abc123def456", jdText: "JD ".repeat(60), resume: PIPE_RESUME, master: PIPE_MASTER };
  const events = await collect(runTailor(LLM, input, { ask }));

  assert.deepEqual(events.map((e) => e.type), ["status", "jd_analysis", "status", "status", "status", "result"]);
  const result = events.at(-1) as Extract<TailorEvent, { type: "result" }>;
  assert.deepEqual(calls, [JDAnalysis, TailorPlan, TailorReview]);
  const bullet = result.changes.find((c) => c.op === "rewrite_bullet")!;
  assert.equal(bullet.after, "Built Python APIs deployed on AWS");
  assert.equal(bullet.reviewed, "improved");
  assert.equal(result.review?.improved, 1);
  assert.deepEqual(result.review?.notes, ["Reads as a Python backend developer; Kubernetes is the gap."]);
  assert.equal(result.thread_id, "ws1:tailor:abc123def456");
  assert.deepEqual(new Set(result.changes.map((c) => c.op)), new Set(["rewrite_bullet", "rewrite_summary"]));
  assert.deepEqual(result.skills, ["Python"]); // the plan had no skills list, so skills are unchanged
  assert.deepEqual(result.gaps.map((g) => g.skill), ["Kubernetes"]); // Python is already backed by the profile
  assert.ok(result.ats.after.score > result.ats.before.score);

  // every step was logged, and the run log endpoint reads them back in order
  const body = await (await call("GET", "/api/v1/tailor/threads/ws1:tailor:abc123def456/history")).json();
  assert.deepEqual(body.steps.map((s: { node: string }) => s.node), ["input", "analyze_jd", "write_edits", "recruiter_review", "check", "score"]);
  assert.deepEqual(body.steps.at(-1).state.ats, result.ats);
  assert.equal((await call("GET", "/api/v1/tailor/threads/ws1:tailor:ffffffffffff/history")).status, 404);
  assert.equal((await call("GET", "/api/v1/tailor/threads/..%2F..%2Fetc/history")).status, 400);

  // the API key is never saved
  assert.ok(!(await savedData()).includes(SECRET));
});

test("the JD analysis is cached per job description", async () => {
  const plan = { changes: [] };
  const { ask, calls } = fakeAsk(new Map<unknown, object[]>([[JDAnalysis, [PIPE_JD]], [TailorPlan, [plan, plan]]]));
  let events: TailorEvent[] = [];
  for (const runId of ["0aaaaaaaa", "1aaaaaaaa"]) {
    events = await collect(runTailor(LLM, { workspace: "ws1", runId, jdText: "Same JD ".repeat(40), resume: PIPE_RESUME, master: PIPE_MASTER }, { ask }));
  }
  assert.deepEqual(calls, [JDAnalysis, TailorPlan, TailorPlan]); // the second run skipped the analysis
  assert.equal((events[1] as Extract<TailorEvent, { type: "jd_analysis" }>).cached, true);
});

test("a failed recruiter review falls back to the draft", async () => {
  const draft = { changes: [{ op: "rewrite_bullet", item_id: "exp1", bullet_id: "exp1_b1", after: "Built APIs in Python on AWS", reason: "r" }] };
  const ask = (async (_cfg, schema) => {
    if (schema === JDAnalysis) return JDAnalysis.parse(PIPE_JD);
    if (schema === TailorPlan) return TailorPlan.parse(draft);
    throw new Error("Rate limited — try again in a minute.");
  }) as NonNullable<RunOptions["ask"]>;
  const events = await collect(runTailor(LLM, { workspace: "ws1", runId: "feedface01", jdText: "Review fails ".repeat(20), resume: PIPE_RESUME, master: PIPE_MASTER }, { ask }));
  const result = events.at(-1) as Extract<TailorEvent, { type: "result" }>;
  assert.equal(result.type, "result");
  assert.equal(result.changes[0]!.after, "Built APIs in Python on AWS");
  assert.equal(result.review?.skipped, "Rate limited — try again in a minute.");
});

test("the recruiter review keeps, improves, drops and adds edits", () => {
  const drafted = [
    { op: "rewrite_bullet", item_id: "exp1", bullet_id: "exp1_b1", after: "Did Python things", reason: "r" },
    { op: "remove_bullet", item_id: "exp1", bullet_id: "exp1_b2", reason: "r" },
    { op: "reorder_bullets", item_id: "exp1", new_order: ["exp1_b2", "exp1_b1"], reason: "r" },
    { op: "update_skills", skills_after: ["Python"], reason: "r" },
  ];
  const { edits, summary } = applyReview(
    drafted,
    TailorReview.parse({
      notes: ["Strong on Python.", "", "Kubernetes missing.", "a fourth note"],
      verdicts: [
        { change: "d1", action: "improve", after: "Built REST APIs in Python", reason: "More specific." },
        { change: "d2", action: "drop", reason: "Docs show communication; keep it." },
        { change: "d3", action: "improve", after: "ignored for reorders", reason: "x" },
        // d4: no verdict → kept
      ],
      additions: [
        { op: "add_bullet", item_id: "exp1", after: "Deployed services on AWS", reason: "AWS is a must-have the profile backs." },
        { op: "remove_bullet", item_id: "exp1", bullet_id: "exp1_b1", reason: "not allowed as an addition" },
        { op: "add_bullet", item_id: "exp1", after: "", reason: "empty" },
      ],
    }),
  );
  assert.deepEqual(edits.map((e) => e.op), ["rewrite_bullet", "reorder_bullets", "update_skills", "add_bullet"]);
  assert.equal(edits[0]!.after, "Built REST APIs in Python");
  assert.equal(edits[0]!.reviewed, "improved");
  assert.equal(edits[3]!.reviewed, "added");
  assert.deepEqual(summary.notes, ["Strong on Python.", "Kubernetes missing.", "a fourth note"]);
  assert.equal(summary.kept, 2);
  assert.equal(summary.improved, 1);
  assert.equal(summary.added, 1);
  assert.deepEqual(summary.dropped.map((d) => d.reason), ["Docs show communication; keep it."]);
});

test("a failed model call becomes an error event", async () => {
  const ask = (async () => {
    throw new Error("OpenAI rejected the API key. Check it in AI settings.");
  }) as NonNullable<RunOptions["ask"]>;
  const events = await collect(runTailor(LLM, { workspace: "ws1", runId: "deadbeef00", jdText: "Another JD ".repeat(10), resume: PIPE_RESUME, master: PIPE_MASTER }, { ask }));
  assert.deepEqual(events.at(-1), { type: "error", message: "OpenAI rejected the API key. Check it in AI settings." });
});

test("chat routes by action and remembers the conversation", async () => {
  const { ask, prompts } = fakeAsk(
    new Map<unknown, object[]>([
      [ChatDecision, [
        { action: "answer", reply: "Kubernetes is the main gap." },
        {
          action: "edit",
          reply: "Added.",
          profile_facts: [
            { skill: "Terraform", item_id: "exp1", note: "Used Terraform for 12 services" },
            { skill: "Azure", item_id: "exp1", note: "Cut costs 40% with Azure" },
          ],
          changes: [{ op: "add_bullet", item_id: "exp1", after: "Provisioned 12 services with Terraform", reason: "r", keywords_added: ["Terraform"] }],
        },
      ]],
    ]),
  );
  const turn = (message: string) =>
    collect(runChat(LLM, { workspace: "ws1", message, resume: PIPE_RESUME, original: PIPE_RESUME, master: PIPE_MASTER, jdAnalysis: PIPE_JD as JdAnalysis }, { ask }));

  const first = (await turn("What's missing?")).at(-1) as Extract<ChatEvent, { type: "result" }>;
  assert.equal(first.action, "answer");
  assert.deepEqual(first.changes, []);

  const second = (await turn("I used Terraform at Acme for 12 services, add it")).at(-1) as Extract<ChatEvent, { type: "result" }>;
  // memory: the second turn saw the first question and answer
  assert.deepEqual(prompts[1].messages.map((m) => m.content), [
    "What's missing?",
    "Kubernetes is the main gap.",
    "I used Terraform at Acme for 12 services, add it",
  ]);
  // edit + facts → record facts → review edits
  assert.deepEqual(second.facts_added.map((f) => f.skill), ["Terraform"]); // the invented Azure/40% fact was dropped
  assert.ok(second.master_profile!.jobs[0].tools.includes("Terraform"));
  assert.deepEqual(second.changes[0].warnings, []); // the stated fact backs the new bullet
  assert.match(second.changes[0].id, /^e[0-9a-f]{4}_1$/);

  const log = await (await call("GET", "/api/v1/tailor/threads/ws1:chat/history")).json();
  assert.deepEqual(log.steps.map((s: { node: string }) => s.node), ["input", "decide", "input", "decide", "record_facts", "review_edits"]);
  assert.ok(!(await savedData()).includes(SECRET));
});

test("schemas fill in defaults for fields the model leaves out", () => {
  const plan = TailorPlan.parse({ changes: [{ op: "add_bullet", item_id: "exp1", reason: "r" }] });
  assert.deepEqual(plan.summary, { after: "", reason: "", keywords_added: [] });
  assert.equal(plan.changes[0].bullet_id, "");
  assert.deepEqual(plan.gaps, []);
  const d = ChatDecision.parse({ action: "answer", reply: "hi" });
  assert.deepEqual(d.profile_facts, []);
});

test("study notes: tuned to what the candidate knows, diagram cleaned up", async () => {
  let sent = "";
  const ask = (async (_cfg, schema, prompt) => {
    assert.equal(schema, StudyNotesSchema);
    sent = String((prompt as { messages: Array<{ content: unknown }> }).messages[0]!.content);
    return StudyNotesSchema.parse({
      category: "Agent framework",
      summary: "CrewAI runs teams of agents.",
      diagram: "```mermaid\nflowchart LR\n  A[\"Task\"] --> B[\"Agent\"]\n```",
      interview_questions: [{ question: "Q?", answer_hint: "A." }],
    });
  }) as NonNullable<RunOptions["ask"]>;
  const notes = await writeStudyNotes(LLM as never, { skill: "CrewAI", knownSkills: ["LangGraph", "Python"], roles: ["AI Engineer at Tredence"] }, { ask });
  assert.ok(sent.includes("## tool\nCrewAI") && sent.includes("LangGraph, Python") && sent.includes("AI Engineer at Tredence"));
  assert.equal(notes.diagram, 'flowchart LR\n  A["Task"] --> B["Agent"]');
  assert.deepEqual(notes.key_concepts, [], "missing fields default instead of failing");
  assert.equal(cleanMermaid("mermaid\nsequenceDiagram\n  A->>B: hi"), "sequenceDiagram\n  A->>B: hi");
});
