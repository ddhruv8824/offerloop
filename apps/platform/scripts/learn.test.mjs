// Run: node --experimental-strip-types --test scripts/learn.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { addToLearn, learnKey, sortForLearning } from "../src/lib/learn.ts";

const T0 = new Date("2026-10-18T09:00:00Z");
const job = (company, missing) => ({ title: "AI Engineer", company, url: `https://www.hirist.tech/j/${company}`, missing });

test("approved jobs add their missing tools, once each", () => {
  const list = [];
  assert.deepEqual(addToLearn(list, [job("Tredence", ["CrewAI", "MCP"]), job("KreditBee", ["CrewAI"])], T0), ["CrewAI", "MCP"]);
  const crew = list.find((i) => i.skill === "CrewAI");
  assert.deepEqual(crew.jobs.map((j) => j.company), ["KreditBee", "Tredence"], "newest first");
  assert.equal(crew.status, "new");
  // Approving the same job again doesn't duplicate it; a new skill name in a different case is the same tool.
  assert.deepEqual(addToLearn(list, [job("Tredence", ["crewai"])], T0), []);
  assert.equal(list.find((i) => i.key === "crewai").jobs.length, 2);
});

test("a tool you know stays known, and what to study comes first", () => {
  const list = [];
  addToLearn(list, [job("A", ["DSPy"]), job("B", ["Qdrant", "DSPy"]), job("C", ["Qdrant", "DSPy"])], T0);
  list.find((i) => i.skill === "Qdrant").status = "known";
  addToLearn(list, [job("D", ["Qdrant"])], T0);
  assert.equal(list.find((i) => i.skill === "Qdrant").status, "known");
  assert.deepEqual(sortForLearning(list).map((i) => i.skill), ["DSPy", "Qdrant"]);
});

test("keys are safe storage names", () => {
  assert.equal(learnKey("Weights & Biases"), "weights-biases");
  assert.equal(learnKey("C++"), "cplusplus");
  assert.equal(learnKey("Next.js"), "next.js");
  assert.match(learnKey("../../etc"), /^[a-z0-9._-]+$/);
  assert.ok(!learnKey("../../etc").startsWith("."));
});
