// Run: node --experimental-strip-types --test scripts/skills.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeSkill, roleFamily, searchSkills, skillsInText, suggestedSkills } from "../src/lib/skills.ts";

test("role family from a free-text target role", () => {
  assert.equal(roleFamily("AI engineer"), "ai");
  assert.equal(roleFamily("GenAI Developer"), "ai");
  assert.equal(roleFamily("Machine Learning Engineer"), "ai");
  assert.equal(roleFamily("Data Analyst"), "data");
  assert.equal(roleFamily("Frontend Developer"), "frontend");
  assert.equal(roleFamily("Backend Engineer"), "backend");
  assert.equal(roleFamily("SDET"), "qa");
  assert.equal(roleFamily("Chef"), null);
});

test("an AI engineer is offered AI skills, not just SQL / Pandas / Spark", () => {
  const s = suggestedSkills("AI engineer", ["Python", "Machine Learning"]);
  for (const skill of ["LLMs", "LangChain", "LangGraph", "RAG", "Vector Databases", "PyTorch"]) assert.ok(s.includes(skill), skill);
  assert.ok(!s.includes("Python"), "already picked skills are left out");
  assert.ok(s.length <= 16);
  assert.ok(suggestedSkills("Chef").includes("Python"), "unknown roles still get general suggestions");
});

test("autocomplete fixes spelling: langraph → LangGraph", () => {
  assert.equal(searchSkills("langraph")[0].name, "LangGraph");
  assert.equal(searchSkills("langgra")[0].name, "LangGraph");
  assert.equal(searchSkills("lang graph")[0].name, "LangGraph");
  assert.equal(searchSkills("pytroch")[0].name, "PyTorch");
  assert.equal(searchSkills("kubernets")[0].name, "Kubernetes");
  assert.equal(searchSkills("reactjs")[0].name, "React");
  assert.equal(searchSkills("k8s")[0].name, "Kubernetes");
  assert.equal(searchSkills("genai")[0].name, "LLMs");
});

test("autocomplete: prefixes first, picked skills hidden, nonsense finds nothing", () => {
  const lang = searchSkills("lang").map((m) => m.name);
  assert.deepEqual(lang.slice(0, 2).sort(), ["LangChain", "LangGraph"]);
  assert.ok(!searchSkills("lang", ["LangChain"]).some((m) => m.name === "LangChain"));
  assert.deepEqual(searchSkills("zzqxv"), []);
  assert.deepEqual(searchSkills(""), []);
});

test("normalizeSkill: catalogue spelling when clearly the same, else as typed", () => {
  assert.equal(normalizeSkill("langraph"), "LangGraph");
  assert.equal(normalizeSkill("  node js "), "Node.js");
  assert.equal(normalizeSkill("postgres"), "PostgreSQL");
  assert.equal(normalizeSkill("Kubernets"), "Kubernetes");
  // a prefix alone isn't enough to rename what someone typed
  assert.equal(normalizeSkill("Lang"), "Lang");
  assert.equal(normalizeSkill("Domain-driven design"), "Domain-driven design");
});

test("skills found in resume text", () => {
  const resume = `
    DHRUV — AI Engineer
    Built a RAG chatbot with LangChain and LangGraph on AWS; vector search in Pinecone.
    Fine-tuned models with PyTorch and Hugging Face. APIs in FastAPI, deployed with Docker.
    Skills: Python, SQL, Pandas, NumPy, scikit-learn, Git, Machine Learning, NLP
    Let's go to the next level. Rated "R" for remarkable.`;
  const found = skillsInText(resume);
  for (const s of ["RAG", "LangChain", "LangGraph", "AWS", "Pinecone", "PyTorch", "Hugging Face", "FastAPI", "Docker", "Python", "SQL", "Pandas", "NumPy", "scikit-learn", "Git", "Machine Learning", "NLP", "Fine-tuning"]) {
    assert.ok(found.includes(s), `missing ${s}`);
  }
  assert.ok(!found.includes("Go"), "'go' as a word isn't Golang");
  assert.ok(!found.includes("R"), "a stray R isn't the R language");
  assert.ok(skillsInText("Languages: Go, Python, R, SQL").includes("Go"));
  assert.ok(skillsInText("Languages: Go, Python, R, SQL").includes("R"));
});

test("everyday words aren't skills unless written like one", () => {
  const found = skillsInText("I excel at taking products to the next level with swift delivery and a spark of curiosity.");
  assert.deepEqual(found, []);
  assert.deepEqual(skillsInText("Tools: Excel, Swift, Spark, Next.js").sort(), ["Excel", "Next.js", "Spark", "Swift"]);
});
