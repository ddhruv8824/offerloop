// Run: node --experimental-strip-types --test scripts/approval-message.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { approvalMessage } from "../src/lib/approval-message.ts";
import { findApprovalLink, linkJobIds, makeApprovalLinks } from "../src/lib/server/approval-links.ts";

const job = (company, score, extra = {}) => ({ id: company, title: "AI Engineer", company, location: "", url: "", score, source: "Hirist", isNew: true, flags: [], ...extra });
const run = { id: "run1", workflowName: "Apply on Hirist", jobs: [job("Walt AI", 63), job("Tredence", 74, { verdict: "Good fit", missing: ["CrewAI", "MCP", "Qdrant", "DSPy"] }), ...["A", "B", "C", "D"].map((c) => job(c, 50))] };
const T0 = new Date("2026-10-18T09:00:00Z");

test("approval message: numbered best first, one-tap links that match the numbers", () => {
  const { links, made } = makeApprovalLinks([], run, T0);
  const text = approvalMessage(run, "https://offerloop-x.onrender.com/", made);
  const lines = text.split("\n");
  assert.equal(lines[0], 'Offerloop: "Apply on Hirist" found 6 jobs and is waiting for your approval.');
  assert.equal(lines[2], "1. AI Engineer — Tredence (74%, Good fit) · new: CrewAI, MCP, Qdrant");
  assert.equal(lines[3], "2. AI Engineer — Walt AI (63%)");
  assert.ok(text.includes(`✅ Approve all 6: https://offerloop-x.onrender.com/a/${made.all}`));
  assert.ok(text.includes(`1 → https://offerloop-x.onrender.com/a/${made.single[0].token}`));
  // "#1" really is Tredence, the job listed first.
  assert.deepEqual(linkJobIds(findApprovalLink(links, made.single[0].token, T0), run), ["Tredence"]);
  assert.equal(linkJobIds(findApprovalLink(links, made.all, T0), run).length, 6);
  assert.equal(findApprovalLink(links, made.skip, T0).action, "skip");
  assert.equal(made.single.length, 5);
});

test("approval links: secret-only, expire, and a new run's links replace the old ones", () => {
  const first = makeApprovalLinks([], run, T0);
  assert.ok(!JSON.stringify(first.links).includes(first.made.all), "only hashes are stored");
  assert.equal(findApprovalLink(first.links, first.made.all, new Date(T0.getTime() + 25 * 3600_000)), null, "expired after 24 h");
  assert.equal(findApprovalLink(first.links, "not-a-real-token-123456", T0), null);
  assert.equal(findApprovalLink(first.links, "../bad", T0), null);
  const again = makeApprovalLinks(first.links, run, T0);
  assert.equal(findApprovalLink(again.links, first.made.all, T0), null, "old links for the same run are retired");
  assert.ok(findApprovalLink(again.links, again.made.all, T0));
});

test("without links the message still points to the site", () => {
  assert.ok(approvalMessage(run, "https://x.dev").endsWith("Approve: https://x.dev/automations"));
});
