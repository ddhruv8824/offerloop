// Run: node --experimental-strip-types --test scripts/salary.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { bandPosition, marketRange, recommendAsk } from "../src/lib/salary.ts";

let n = 0;
const obs = (min, max, over = {}) => ({ jobId: `j${n++}`, title: "Frontend Developer", company: "Co", location: "Bangalore", min, max, minExperience: 1, maxExperience: 4, source: "Hirist", seenAt: "2026-10-01T00:00:00Z", ...over });
const target = { targetRole: "Frontend Developer", experienceYears: 2, locations: ["Bangalore", "Remote"] };
const match = { sameRole: (t) => /front/i.test(t), sameCity: (l) => /bangalore|bengaluru/i.test(l) };

test("market: needs at least 3 postings — otherwise no answer, not a made-up one", () => {
  assert.equal(marketRange([], target, match), null);
  assert.equal(marketRange([obs(10, 15), obs(12, 18)], target, match), null);
  assert.ok(marketRange([obs(10, 15), obs(12, 18), obs(11, 16)], target, match));
});

test("market: median of the published bottoms and tops", () => {
  const m = marketRange([obs(10, 14), obs(12, 18), obs(14, 20), obs(11, 16), obs(13, 22)], target, match);
  assert.equal(m.low, 12);
  assert.equal(m.high, 18);
  assert.equal(m.postings, 5);
  assert.equal(m.confidence, "fair");
  assert.match(m.basis, /in Bangalore/);
  // Each posting is for 1-4 years; at 2 years the person is a third of the way up each range.
  assert.equal(m.typical, 14);
});

test("band position: where you sit in a posting's experience range", () => {
  assert.equal(bandPosition(2, 3, 8), 0, "below the band = its junior end");
  assert.equal(bandPosition(3, 3, 8), 0);
  assert.equal(bandPosition(5.5, 3, 8), 0.5);
  assert.equal(bandPosition(12, 3, 8), 1, "above the band = its senior end");
  assert.equal(bandPosition(2, undefined, undefined), 0.5, "unknown band = the middle");
  assert.equal(bandPosition(2, 4, 4), 0.5, "a band with no width tells us nothing");
});

test("market: the figure for you depends on your experience, not just the range", () => {
  // Found in real data: "22-25 LPA for 3-8 years". The top is for the 8-year person.
  const wide = { minExperience: 3, maxExperience: 8 };
  const postings = [obs(22, 25, wide), obs(20, 30, wide), obs(18, 28, wide)];
  const junior = marketRange(postings, { ...target, experienceYears: 3 }, match);
  const senior = marketRange(postings, { ...target, experienceYears: 8 }, match);
  assert.equal(junior.low, senior.low, "the published range is the same for both");
  assert.equal(junior.typical, 20, "junior end of each range");
  assert.equal(senior.typical, 28, "senior end of each range");
});

test("market: one extreme posting doesn't drag the range", () => {
  const m = marketRange([obs(10, 14), obs(12, 18), obs(14, 20), obs(11, 16), obs(60, 150)], target, match);
  assert.equal(m.high, 18, "median, not average");
});

test("market: only counts similar roles, and each posting once", () => {
  const same = obs(10, 14);
  const m = marketRange([same, same, { ...same }, obs(12, 18), obs(14, 20), obs(40, 60, { title: "Sales Manager" }), obs(50, 70, { title: "Data Engineer" })], target, match);
  assert.equal(m.postings, 3, "the same job seen three times is one posting; other roles are ignored");
});

test("market: widens from city → India → all levels only when it must, and says so", () => {
  const pune = { location: "Pune" };
  // Only 2 in Bangalore, but 5 across India for this experience.
  const m = marketRange([obs(10, 14), obs(12, 18), obs(9, 13, pune), obs(11, 15, pune), obs(13, 19, pune)], target, match);
  assert.match(m.basis, /across India/);
  assert.doesNotMatch(m.basis, /Bangalore/);
  assert.equal(m.postings, 5);

  // Senior-only postings: nothing fits 2 years, so it falls back to all levels and says that.
  const senior = { minExperience: 8, maxExperience: 12 };
  const wide = marketRange([obs(30, 40, senior), obs(35, 45, senior), obs(32, 50, senior)], target, match);
  assert.match(wide.basis, /all experience levels/);
  assert.equal(wide.confidence, "low");
});

test("market: prefers a specific group once it has enough, over a bigger general one", () => {
  const pune = { location: "Pune" };
  const local = [obs(20, 24), obs(21, 25), obs(22, 26), obs(20, 26), obs(21, 24)];
  const elsewhere = Array.from({ length: 12 }, () => obs(8, 10, pune));
  const m = marketRange([...local, ...elsewhere], target, match);
  assert.match(m.basis, /in Bangalore/);
  assert.equal(m.high, 25);
});

test("market: 'up to X' postings count for the top only", () => {
  const m = marketRange([obs(0, 20), obs(0, 22), obs(10, 18)], target, match);
  assert.equal(m.high, 20);
  assert.equal(m.low, 10, "the only real bottom");
  const onlyUpTo = marketRange([obs(0, 20), obs(0, 22), obs(0, 18)], target, match);
  assert.ok(onlyUpTo.low < onlyUpTo.high);
});

test("market: junk numbers are ignored", () => {
  assert.equal(marketRange([obs(10, 14), obs(12, 18), obs(500, 900), obs(20, 5)], target, match), null, "only 2 sane postings remain");
});

const market = { low: 12, high: 20, typical: 16, postings: 9, basis: "Frontend Developer roles for about 2 years' experience in Bangalore", confidence: "fair" };

test("ask: nothing to go on → no advice", () => {
  assert.equal(recommendAsk({}), null);
  assert.equal(recommendAsk({ market: null, currentCtcLpa: 0 }), null);
});

test("ask: from the market alone — the figure for your experience, floor at the range's bottom", () => {
  const a = recommendAsk({ market });
  assert.equal(a.ask, 16);
  assert.match(a.reasons[0], /about 16 LPA/);
  assert.equal(a.floor, 12);
  assert.equal(a.confidence, "fair");
  assert.match(a.reasons[0], /12–20 LPA \(9 postings\)/);
  assert.equal(a.cautions.length, 0);
});

test("ask: never below a 30% raise or the person's own minimum", () => {
  const raise = recommendAsk({ market, currentCtcLpa: 16 }); // 16 × 1.3 = 20.8
  assert.equal(raise.ask, 21);
  assert.ok(raise.cautions.some((c) => c.includes("above the top")), "asking above the market top is flagged");
  assert.equal(raise.floor, 18.5, "at least a 15% raise");

  const min = recommendAsk({ market, minSalaryLpa: 19 });
  assert.equal(min.ask, 19);
  assert.equal(min.floor, 19);
});

test("ask: a low current CTC doesn't drag the ask below the market", () => {
  const a = recommendAsk({ market, currentCtcLpa: 6 }); // 30% would be only 7.8
  assert.equal(a.ask, 16);
  assert.match(a.reasons.join(" "), /167% above your current 6 LPA/);
  assert.ok(a.cautions.some((c) => c.includes("big jump")), "a very large jump is right to ask for, but needs a warning");
  assert.ok(!recommendAsk({ market, currentCtcLpa: 14 }).cautions.some((c) => c.includes("big jump")), "an ordinary raise gets no such warning");
});

test("ask: a posting's own stated pay beats the general market", () => {
  const a = recommendAsk({ posted: [22, 26], market, currentCtcLpa: 10 });
  assert.equal(a.ask, 24.5);
  // The same posting, for someone at the junior or senior end of the experience it asks for.
  const junior = recommendAsk({ posted: [22, 26], postedBandPosition: 0 });
  const senior = recommendAsk({ posted: [22, 26], postedBandPosition: 1 });
  assert.equal(junior.ask, 23);
  assert.equal(senior.ask, 25.5);
  assert.match(junior.reasons[0], /junior end/);
  assert.match(senior.reasons[0], /senior end/);
  assert.equal(a.floor, 22);
  assert.equal(a.confidence, "good");
  assert.match(a.reasons[0], /22–26 LPA/);

  const upTo = recommendAsk({ posted: [0, 30] });
  assert.equal(upTo.ask, 27);

  const tooLow = recommendAsk({ posted: [8, 10], currentCtcLpa: 12 });
  assert.equal(tooLow.ask, 15.5);
  assert.ok(tooLow.cautions.some((c) => c.includes("above this posting's stated top of 10")));
});

test("ask: with only personal numbers it still answers, and says the data is thin", () => {
  const a = recommendAsk({ currentCtcLpa: 10 });
  assert.equal(a.ask, 13);
  assert.equal(a.floor, 11.5);
  assert.ok(a.cautions.some((c) => c.includes("no published pay")));
  assert.equal(a.confidence, "low");
});

test("ask: thin market data is called out; the floor never exceeds the ask", () => {
  const thin = recommendAsk({ market: { ...market, postings: 3, confidence: "low" } });
  assert.ok(thin.cautions.some((c) => c.includes("Only 3 postings")));
  const a = recommendAsk({ market: { ...market, low: 19.5, high: 20 }, minSalaryLpa: 5 });
  assert.ok(a.floor <= a.ask);
});
