// Run: node --experimental-strip-types --test scripts/email-classifier.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyEmail, gmailQuery } from "../src/lib/email-classifier.ts";

const cases = [
  ["Thank you for applying to Northwind Pay", "We have received your application for Frontend Developer.", "applied", "high"],
  ["Your application status", "Your application is currently under review by our hiring team.", "in_review", "high"],
  ["Next steps", "Please complete the online assessment on HackerRank within 3 days.", "assessment", "high"],
  ["Interview invitation", "We would like to invite you to an interview. Please share your availability.", "interview", "high"],
  ["Update on your application", "Thank you for applying. Unfortunately, we have decided to move forward with other candidates.", "rejected", "high"],
  ["Regarding your candidacy", "We regret to inform you that the position has been filled.", "rejected", "high"],
  ["Congratulations!", "We are delighted to offer you the role of Frontend Developer. Your offer letter is attached.", "offer", "high"],
  // Weak signals stay low confidence (suggestions only).
  ["Quick note", "Unfortunately our office is closed on Friday.", "rejected", "low"],
  // A weak word must not hide a strong confirmation.
  ["Application received", "Unfortunately the portal was slow today, but we have received your application.", "applied", "high"],
];

for (const [subject, body, kind, confidence] of cases) {
  test(`${subject} → ${kind}/${confidence}`, () => {
    const result = classifyEmail(subject, body);
    assert.ok(result, "expected a classification");
    assert.equal(result.kind, kind);
    assert.equal(result.confidence, confidence);
    assert.ok(result.evidence.length > 0);
  });
}

test("newsletters are ignored", () => {
  assert.equal(classifyEmail("Your weekly digest", "Here are 5 articles we think you'll like."), null);
});

test("query includes company names and excludes sent mail", () => {
  const q = gmailQuery(["Northwind Pay", 'Bad "Name"'], 30);
  assert.match(q, /newer_than:30d/);
  assert.match(q, /"Northwind Pay"/);
  assert.match(q, /"Bad Name"/);
  assert.match(q, /-in:sent/);
});
