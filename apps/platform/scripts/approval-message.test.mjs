// Run: node --experimental-strip-types --test scripts/approval-message.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { approvalMessage } from "../src/lib/approval-message.ts";

const job = (company, score, extra = {}) => ({ id: company, title: "AI Engineer", company, location: "", url: "", score, source: "Hirist", isNew: true, flags: [], ...extra });

test("approval message: best jobs first, a link, and what's new to learn", () => {
  const text = approvalMessage(
    { workflowName: "Apply on Hirist", jobs: [job("Walt AI", 63), job("Tredence", 74, { verdict: "Good fit", missing: ["CrewAI", "MCP", "Qdrant", "DSPy"] }), ...["A", "B", "C", "D"].map((c) => job(c, 50))] },
    "https://offerloop-x.onrender.com/",
  );
  const lines = text.split("\n");
  assert.equal(lines[0], 'Offerloop: "Apply on Hirist" found 6 jobs and is waiting for your approval.');
  assert.equal(lines[2], "• AI Engineer — Tredence (74%, Good fit) · new: CrewAI, MCP, Qdrant");
  assert.equal(lines[3], "• AI Engineer — Walt AI (63%)");
  assert.ok(text.includes("…and 1 more"));
  assert.ok(text.endsWith("Approve: https://offerloop-x.onrender.com/automations"));
});
