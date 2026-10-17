// Run: node --experimental-strip-types --test scripts/jobs.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalSkill, dedupe, extractSkills, locationFit, parseMinExperience, roleRelevance, scoreJob } from "../src/lib/jobs.ts";

const profile = {
  targetRole: "Frontend Developer",
  skills: ["React", "TypeScript", "Next.js", "Tailwind CSS", "Python"],
  locations: ["Pune", "Bangalore", "Remote"],
  experienceYears: 2,
  minSalaryLpa: 12,
  dealBreakers: ["No night shifts"],
};
const job = (over = {}) => ({
  id: "t:1", source: "Ashby", company: "Acme", title: "Frontend Engineer", location: "Bengaluru, India", remote: false,
  url: "https://example.com/1", skills: [], description: "We use React, TypeScript and GraphQL. 2+ years of experience.", ...over,
});

test("skills: finds real skills, not lookalikes", () => {
  const s = extractSkills("React.js, Node, Java and JavaScript with PostgreSQL on AWS; CI/CD via GitHub Actions");
  for (const want of ["React", "Node.js", "Java", "JavaScript", "PostgreSQL", "AWS", "CI/CD"]) assert.ok(s.includes(want), `missing ${want}`);
  assert.ok(!extractSkills("We love javascript").includes("Java"), "javascript is not Java");
  assert.ok(!extractSkills("Go to market strategy; let's go").includes("Go"), "'go' the verb is not Go");
  assert.ok(extractSkills("Backend in Go, Rust").includes("Go"));
  assert.ok(!extractSkills("a pragmatic and reactive team").includes("React"));
});

test("skills: canonical names", () => {
  assert.equal(canonicalSkill("React.js"), "React");
  assert.equal(canonicalSkill("Javascript"), "JavaScript");
  assert.equal(canonicalSkill("Some Internal Tool"), "Some Internal Tool");
});

test("role relevance", () => {
  assert.equal(roleRelevance("Senior Frontend Engineer", "Frontend Developer"), 1);
  assert.equal(roleRelevance("React Developer", "Frontend Developer"), 1);
  assert.equal(roleRelevance("Full Stack Engineer", "Frontend Developer"), 0.7);
  assert.ok(roleRelevance("Software Engineer", "Frontend Developer") > 0);
  assert.equal(roleRelevance("Account Executive", "Frontend Developer"), 0);
  assert.equal(roleRelevance("Technical Recruiter", "Frontend Developer"), 0);
  assert.ok(roleRelevance("Data Engineer", "Frontend Developer") < 0.5);
});

test("role relevance: the role a title names beats the tech it mentions", () => {
  // Found in real data: a test role scored as a developer role because "Python" was in the title.
  assert.equal(roleRelevance("Control Software Test Engineer - Python", "Frontend Developer"), 0);
  assert.equal(roleRelevance("QA Automation Engineer (JavaScript)", "Frontend Developer"), 0);
  assert.equal(roleRelevance("Embedded Firmware Engineer", "Frontend Developer"), 0);
  assert.equal(roleRelevance("Python Developer", "Backend Developer"), 1, "tech hint counts when nothing clearer is said");
  assert.ok(roleRelevance("EMT3_VM_Python_Gen_AI_Developer", "Frontend Developer") <= 0.25, "underscored titles are still read");
  assert.equal(roleRelevance("Backend Engineer", "Software Engineer"), 0.85);
  // Word boundaries matter: "ui" must not match inside "build", "ai" not inside "maintain".
  assert.equal(roleRelevance("Build Engineer", "Frontend Developer"), 0);
  assert.equal(roleRelevance("Maintenance Technician", "Machine Learning Engineer"), 0);
});

test("location: remote only counts when it's open to India", () => {
  // Found in real data: "remote-friendly" San Francisco roles shown to someone in Pune.
  assert.equal(locationFit({ location: "San Francisco", remote: true }, ["Pune", "Remote"]), null);
  assert.equal(locationFit({ location: "New York / San Francisco", remote: true }, ["Remote"]), null);
  assert.equal(locationFit({ location: "Remote", remote: true }, ["Remote"]), "remote");
  assert.equal(locationFit({ location: "Remote - APAC", remote: true }, ["Remote"]), "remote");
  assert.equal(locationFit({ location: "Jaipur", remote: true, inIndia: true }, ["Remote"]), "remote", "an India-only source is open to India");
  assert.equal(locationFit({ location: "Kochi", remote: false, inIndia: true }, []), "exact", "no cities chosen = anywhere in India");
});

test("scoring: little information means a modest score", () => {
  // Found in real data: a title-only posting scored 90 from one skill in its title.
  const titleOnly = scoreJob(job({ title: "Engineer, Frontend React", description: "" }), profile);
  assert.ok(titleOnly.score <= 80, `title-only scored ${titleOnly.score}`);
  assert.equal(titleOnly.limitedInfo, true);
  const detailed = scoreJob(job({ description: "React, TypeScript, Next.js and Tailwind CSS. 2 years of experience." }), profile);
  assert.ok(detailed.score > titleOnly.score, "a posting that really matches should outrank one we know little about");
  assert.equal(detailed.limitedInfo, undefined);
});

test("scoring: 5 of 6 listed skills outranks 1 of 1", () => {
  // Found in real data: a generic role naming one skill you have beat a real match naming six.
  const oneOfOne = scoreJob(job({ description: "", skills: [{ name: "Python" }] }), profile);
  const fiveOfSix = scoreJob(job({ description: "", skills: ["React", "TypeScript", "Next.js", "Tailwind CSS", "Python", "Kafka"].map((name) => ({ name })) }), profile);
  assert.ok(fiveOfSix.score > oneOfOne.score, `${fiveOfSix.score} vs ${oneOfOne.score}`);
});

test("scoring: very old postings rank lower and say why", () => {
  // Found in real data: a posting from 3.5 years ago ranked second.
  const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
  const fresh = scoreJob(job({ postedAt: daysAgo(5) }), profile);
  const old = scoreJob(job({ postedAt: daysAgo(1200) }), profile);
  assert.equal(fresh.score - old.score, 10);
  assert.ok(old.flags.some((f) => f.includes("over a year")));
  assert.equal(fresh.flags.length, 0);
  assert.equal(scoreJob(job({ postedAt: undefined }), profile).score, fresh.score, "no date = no penalty");
});

test("scoring: a clearly low employee rating is flagged, without changing the score", () => {
  // Found in real data: a company rated 1.5/5 by 12 reviewers.
  const info = (rating, reviewsCount) => ({ rating, reviewsCount, benefits: [], roleRatings: [], source: "test" });
  const plain = scoreJob(job(), profile);
  const low = scoreJob(job({ companyInfo: info(1.5, 12) }), profile);
  assert.ok(low.flags.some((f) => f.includes("1.5 out of 5") && f.includes("12 reviews")));
  assert.equal(low.score, plain.score, "culture is information, not part of the skills match");
  assert.equal(scoreJob(job({ companyInfo: info(1.5, 3) }), profile).flags.length, 0, "3 reviews is too few to warn on");
  assert.equal(scoreJob(job({ companyInfo: info(3.6, 500) }), profile).flags.length, 0, "an ordinary rating isn't a warning");
});

test("role relevance: writing roles are not developer roles", () => {
  assert.equal(roleRelevance("Content Developer", "Frontend Developer"), 0);
  assert.equal(roleRelevance("Sr. Technical Writer / Information developer", "Frontend Developer"), 0);
});

test("location", () => {
  assert.equal(locationFit({ location: "Bengaluru, Karnataka, India", remote: false }, ["Bangalore"]), "exact");
  assert.equal(locationFit({ location: "Gurugram", remote: false }, ["Delhi NCR"]), "exact");
  assert.equal(locationFit({ location: "Hyderabad", remote: false }, ["Pune"]), null);
  assert.equal(locationFit({ location: "Remote - India", remote: true }, ["Pune", "Remote"]), "remote");
  assert.equal(locationFit({ location: "Remote - United States", remote: true }, ["Pune", "Remote"]), null, "US-only remote isn't for India");
  assert.equal(locationFit({ location: "Remote", remote: true }, ["Pune"]), null, "didn't ask for remote");
});

test("experience parsing", () => {
  assert.equal(parseMinExperience("3+ years of experience with React"), 3);
  assert.equal(parseMinExperience("4-6 yrs experience building APIs"), 4);
  assert.equal(parseMinExperience("Founded 10 years ago, we are a fintech."), undefined);
  assert.equal(parseMinExperience("No numbers here"), undefined);
});

test("scoring: good fit beats weak fit, with reasons", () => {
  const good = scoreJob(job(), profile);
  assert.ok(good && good.score >= 75, `good fit scored ${good?.score}`);
  assert.deepEqual(good.matched.sort(), ["React", "TypeScript"]);
  assert.deepEqual(good.missing, ["GraphQL"]);
  assert.equal(good.description, undefined, "full description never leaves the scorer");

  const senior = scoreJob(job({ title: "Staff Frontend Engineer", description: "React. 8+ years of experience." }), profile);
  assert.ok(senior.score < good.score);
  assert.ok(senior.flags.some((f) => f.includes("8+ years")));

  assert.equal(scoreJob(job({ title: "Sales Manager" }), profile), null);
  assert.equal(scoreJob(job({ location: "London, UK" }), profile), null);
});

test("scoring: mandatory skills weigh more, flags fire", () => {
  const a = scoreJob(job({ description: "", skills: [{ name: "React.js", required: true }, { name: "Kafka" }] }), profile);
  const b = scoreJob(job({ description: "", skills: [{ name: "React.js" }, { name: "Kafka", required: true }] }), profile);
  assert.ok(a.score > b.score, "having the mandatory skill should score higher");

  const flagged = scoreJob(job({ salaryLpa: [6, 9], description: "React. Rotational shift including night shift." }), profile);
  assert.ok(flagged.flags.some((f) => f.includes("below your 12 LPA")), "pay read from the text only warns");
  assert.match(flagged.vetoed ?? "", /night/i, "a deal-breaker rules the job out");
});

test("fit: a breakdown, a verdict and reasons for and against", () => {
  const good = scoreJob(job({ description: "React, TypeScript and Next.js. 2+ years of experience.", salaryLpa: [14, 20], salarySource: "posting" }), profile);
  assert.equal(good.fit.verdict, good.score >= 80 ? "Strong fit" : "Good fit");
  assert.deepEqual(good.fit.areas.map((a) => a.key), ["skills", "role", "experience", "location", "pay"]);
  assert.equal(good.fit.areas.find((a) => a.key === "pay").status, "good");
  assert.ok(good.fit.strengths.some((s) => s.startsWith("Has 3 of 3 skills")));
  assert.ok(good.fit.strengths.length <= 3);
  assert.equal(good.vetoed, undefined);

  const stretch = scoreJob(job({ title: "Senior Frontend Engineer", description: "", skills: [{ name: "Angular", required: true }, { name: "React" }], minExperience: 5 }), profile);
  assert.ok(stretch.fit.gaps.some((g) => g.includes("must-have skill: Angular")));
  assert.ok(stretch.fit.gaps.some((g) => g.includes("3 years short")));
  assert.equal(stretch.fit.verdict, "Long shot");

  const vague = scoreJob(job({ description: "", skills: [] }), profile);
  assert.equal(vague.fit.areas.find((a) => a.key === "skills").status, "unknown");
  assert.equal(vague.fit.areas.find((a) => a.key === "pay").note, "Not stated");
});

test("deal-breakers rule jobs out", () => {
  const strict = { ...profile, dealBreakers: ["No service bond", "Remote only", "No crypto"] };
  assert.match(scoreJob(job({ remote: true, description: "React. 2 year service bond applies." }), strict).vetoed, /bond/);
  assert.equal(scoreJob(job({ remote: false, location: "Pune" }), strict).vetoed, "Not a remote role");
  assert.equal(scoreJob(job({ remote: true, location: "Remote, India" }), strict).vetoed, undefined);
  // A custom one rules out jobs that name it in the title or company; in the description it only warns.
  assert.match(scoreJob(job({ remote: true, company: "Crypto Labs" }), strict).vetoed, /No crypto/);
  assert.match(scoreJob(job({ remote: true, company: "CoinCrypto" }), strict).vetoed, /No crypto/);
  const mention = scoreJob(job({ remote: true, description: "React. Our clients include crypto exchanges." }), strict);
  assert.equal(mention.vetoed, undefined);
  assert.ok(mention.flags.some((f) => f.includes("No crypto")));
  assert.equal(scoreJob(job({ remote: true, description: "React and cryptography." }), strict).flags.length, 0, "whole words only");
  // Pay the posting itself states, below the minimum, rules it out too.
  assert.match(scoreJob(job({ salaryLpa: [6, 9], salarySource: "posting" }), profile).vetoed, /below your 12 LPA/);
});

test("dedupe: same role on Hirist and the company site is one result", () => {
  const direct = scoreJob(job({ id: "a", source: "Ashby", company: "Acme Technologies" }), profile);
  const hirist = scoreJob(job({ id: "h", source: "Hirist", company: "Acme", title: "Acme - Frontend Engineer - React.js", location: "Bangalore" }), profile);
  const other = scoreJob(job({ id: "o", title: "Backend Engineer", description: "Node. 2 years experience." }), { ...profile, targetRole: "Software Engineer" });
  const out = dedupe([hirist, direct, other]);
  assert.equal(out.length, 2);
  const kept = out.find((j) => j.title.includes("Frontend"));
  assert.equal(kept.source, "Ashby", "prefers the company's own posting");
  assert.deepEqual(kept.alsoOn, ["Hirist"]);
});
