// Run: node --experimental-strip-types --test scripts/resume-facts.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { resumeFacts } from "../src/lib/resume-facts.ts";

const NOW = new Date("2026-10-16T00:00:00Z");

test("one-line jobs: title, company and dates on the same line", () => {
  const text = `DHRUV SAGAR
AI Engineer | dhruv@example.com | +91 98765 43210
EXPERIENCE
Software Engineer — Inspiron Labs            Jan 2024 – Present
• Built a RAG assistant with LangGraph serving 2,000 users
Associate Developer, Acme Corp               Jun 2022 – Dec 2023
• Worked as a Frontend Engineer on the dashboard.
EDUCATION
B.Tech Computer Science, XYZ University      2018 – 2022`;
  const f = resumeFacts(text, NOW);
  assert.equal(f.name, "Dhruv Sagar");
  assert.equal(f.currentRole, "Software Engineer");
  assert.equal(f.experienceYears, 4); // Jun 2022 → Oct 2026, the degree not counted
});

test("stacked jobs: company, title and dates on separate lines", () => {
  const text = `Priya Nair
Bangalore · priya@example.com
Work Experience
Globex
Senior Data Analyst
Mar 2023 - Present
- Owned the revenue dashboards
Initech
Data Analyst
07/2020 - 02/2023
Projects
Shelfie — 2021 - 2022`;
  const f = resumeFacts(text, NOW);
  assert.equal(f.name, "Priya Nair");
  assert.equal(f.currentRole, "Senior Data Analyst");
  assert.equal(f.experienceYears, 6); // Jul 2020 → Oct 2026; the project after "Projects" isn't a job
});

test("overlapping jobs count once; bare years count whole years", () => {
  const text = `Sam Lee
Experience
Backend Developer at Foo   2021 - 2023
Freelance Developer   2022 - 2023
Skills
Python`;
  const f = resumeFacts(text, NOW);
  assert.equal(f.experienceYears, 3); // Jan 2021 → Dec 2023
  assert.equal(f.currentRole, undefined, "no job says Present");
});

test("no experience heading: degrees near a date are skipped", () => {
  const text = `Asha
SDE II, Flipkart  Aug 2023 - Present
B.Tech, IIT Delhi  2016 - 2020`;
  const f = resumeFacts(text, NOW);
  assert.equal(f.currentRole, "SDE II");
  assert.equal(f.experienceYears, 3);
});

test("nothing to find: no guesses", () => {
  assert.deepEqual(resumeFacts("Curriculum Vitae\nI like building things.", NOW), {});
});
