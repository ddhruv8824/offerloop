// Run: node --experimental-strip-types --test scripts/company-info.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { companyInfoFromAmbitionBox, formatSalary, insightsFor, parseSalaryLpa, roleRatingFor } from "../src/lib/company-info.ts";

// Shaped like the real block Hirist returns (trimmed).
const labcorp = {
  ambitionBoxCompanyId: 175295,
  companyName: "Labcorp",
  reviewsCount: 353,
  aboutCompany: "<p>Labcorp is…</p>",
  foundedYear: "1969",
  totalEmployeesIndia: "501-1000",
  companyType: "Foreign MNC",
  primaryIndustry: "Clinical Research",
  hq: "Burlington, North Carolina",
  url: "https://www.ambitionbox.com/reviews/labcorp-reviews",
  aggregateRating: 4.1,
  benefits: [
    { name: "Free Meal", count: 2 },
    { name: "Health Insurance", count: 31 },
    { name: "Learning & Development Support", count: 24 },
  ],
  topJobProfilesEntities: [
    { name: "Senior Data Analyst", count: 4, rating: 3.4 },
    { name: "Business Analyst", count: 4, rating: 3.4 },
    { name: "Senior Manager", count: 5, rating: 4.9 },
    { name: "Intern", count: 1, rating: 5 },
  ],
};

test("company info: maps the real block", () => {
  const info = companyInfoFromAmbitionBox(labcorp);
  assert.equal(info.rating, 4.1);
  assert.equal(info.reviewsCount, 353);
  assert.equal(info.reviewsUrl, "https://www.ambitionbox.com/reviews/labcorp-reviews");
  assert.deepEqual(info.benefits.map((b) => b.name), ["Health Insurance", "Learning & Development Support", "Free Meal"], "most-reported first");
  assert.equal(info.employeesIndia, "501-1000");
  assert.equal(info.companyType, "Foreign MNC");
  assert.equal(info.source, "AmbitionBox, via Hirist");
});

test("company info: empty or junk blocks give null, never a card full of blanks", () => {
  assert.equal(companyInfoFromAmbitionBox(null), null);
  assert.equal(companyInfoFromAmbitionBox({}), null);
  assert.equal(companyInfoFromAmbitionBox({ companyName: "X", companyLogo: "https://x/y.png" }), null);
  assert.equal(companyInfoFromAmbitionBox("nope"), null);
});

test("company info: bad values are dropped, not shown", () => {
  const info = companyInfoFromAmbitionBox({ aggregateRating: 9.7, reviewsCount: -3, url: "javascript:alert(1)", totalEmployeesIndia: "51-200", benefits: [{ name: "", count: 4 }, null, { name: "Gym" }] });
  assert.equal(info.rating, undefined, "a rating above 5 is not a rating");
  assert.equal(info.reviewsCount, undefined);
  assert.equal(info.reviewsUrl, undefined, "only real AmbitionBox links are kept");
  assert.deepEqual(info.benefits, [{ name: "Gym", count: 0 }]);
  assert.equal(companyInfoFromAmbitionBox({ aggregateRating: 4, url: "https://evil.example/ambitionbox.com" }).reviewsUrl, undefined);
});

test("role rating: matches the reviewed role inside the job title, needs 3+ reviews", () => {
  const info = companyInfoFromAmbitionBox(labcorp);
  assert.deepEqual(roleRatingFor(info, "Senior Data Analyst - Clinical"), { name: "Senior Data Analyst", rating: 3.4, count: 4 });
  assert.equal(roleRatingFor(info, "Frontend Developer"), undefined);
  assert.equal(roleRatingFor(info, "Summer Intern"), undefined, "one review is not enough to quote");
});

test("insights record: compact, and absent when there's nothing to show", () => {
  const companyInfo = companyInfoFromAmbitionBox(labcorp);
  const full = insightsFor({ title: "Business Analyst", companyInfo, salaryLpa: [12, 18], salarySource: "posting" });
  assert.equal(full.rating, 4.1);
  assert.deepEqual(full.benefits, ["Health Insurance", "Learning & Development Support", "Free Meal"]);
  assert.deepEqual(full.roleRating, { name: "Business Analyst", rating: 3.4, count: 4 });
  assert.deepEqual(full.salaryLpa, [12, 18]);
  assert.equal(full.source, "AmbitionBox, via Hirist");

  const salaryOnly = insightsFor({ title: "Frontend Developer", salaryLpa: [0, 30], salarySource: "description" });
  assert.equal(salaryOnly.rating, undefined);
  assert.deepEqual(salaryOnly.benefits, []);
  assert.equal(salaryOnly.salarySource, "description");

  assert.equal(insightsFor({ title: "Frontend Developer" }), undefined, "no data → no record, so the UI can say so");
});

test("salary: reads real-world phrasings", () => {
  assert.deepEqual(parseSalaryLpa("CTC: 18-25 LPA based on experience"), [18, 25]);
  assert.deepEqual(parseSalaryLpa("Salary 12 – 18 lakhs per annum"), [12, 18]);
  assert.deepEqual(parseSalaryLpa("Offering 10 LPA to 14 LPA"), [10, 14]);
  assert.deepEqual(parseSalaryLpa("Compensation: 7.5 to 9.5 Lacs"), [7.5, 9.5]);
  assert.deepEqual(parseSalaryLpa("Package up to 30 LPA"), [0, 30]);
  assert.deepEqual(parseSalaryLpa("Budget: upto ₹22 lakhs"), [0, 22]);
  assert.deepEqual(parseSalaryLpa("CTC offered is 15 LPA"), [15, 15]);
  assert.deepEqual(parseSalaryLpa("₹18,00,000 - ₹25,00,000 per annum"), [18, 25]);
  assert.deepEqual(parseSalaryLpa("INR 1200000 per annum"), [12, 12]);
});

test("salary: never mistakes other numbers for pay", () => {
  for (const text of [
    "5-8 years of experience with React",
    "Join a team of 20 engineers serving 5 lakh users",
    "We raised $25 million; 10-15 interviews per week",
    "Notice period: 30 to 60 days",
    "Work 9 to 6, 5 days a week",
    "Salary: best in the industry",
    "Handle 10 lakh requests per day",
    "",
  ]) {
    assert.equal(parseSalaryLpa(text), undefined, `read pay from: "${text}"`);
  }
});

test("salary: rejects impossible ranges", () => {
  assert.equal(parseSalaryLpa("CTC 25-18 LPA"), undefined, "max below min");
  assert.equal(parseSalaryLpa("CTC 900 LPA"), undefined, "not a real salary");
});

test("salary: formatting", () => {
  assert.equal(formatSalary([18, 25]), "18–25 LPA");
  assert.equal(formatSalary([15, 15]), "15 LPA");
  assert.equal(formatSalary([0, 30]), "up to 30 LPA");
});
