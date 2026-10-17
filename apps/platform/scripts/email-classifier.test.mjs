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
  // Weak signals about an application stay low confidence (suggestions only).
  ["Update", "Unfortunately the hiring team needs a few more days to review your application.", "rejected", "low"],
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

test("a weak word with no application in sight is ignored", () => {
  assert.equal(classifyEmail("Quick note", "Unfortunately our office is closed on Friday."), null);
});

// The emails that wrongly landed in "Needs your review".
test("job alerts, newsletters, group mail and practice tools are ignored", () => {
  const noise = [
    ["New jobs: Senior Fullstack Engineer, Growth at Nivoda and 7 more jobs", "Interview Open to offers Closed to Offers Senior Fullstack Eng", "Wellfound <team@hi.wellfound.com>"],
    ["Your Frontend Engineer interview at Apple is ready", "Hi Dhruv, Toby has researched Apple and built your practice interview.", "Toby <hello@usetoby.ai>"],
    ["Don't miss conversations in Artificial Intelligence, Machine Learning, Data Science & Robotics", "Unfortunately LinkedIn has group member limit of 3 Millions", "LinkedIn <groups-noreply@linkedin.com>"],
    ["One Size Might Fit Some", "Everyone wants a framework, unfortunately few do it well", "Kevin Eikenberry via LinkedIn <newsletters-noreply@linkedin.com>"],
    ["25 new jobs for Frontend Developer", "Apply now — your application could be next.", "Naukri <jobalerts@naukri.com>"],
  ];
  for (const [subject, body, from] of noise) assert.equal(classifyEmail(subject, body, { from }), null, subject);
});

test("real updates still count, even from LinkedIn or with an unsubscribe link", () => {
  const sent = classifyEmail("Your application was sent to Acme", "Thank you for applying to Acme.", { from: "LinkedIn <jobs-noreply@linkedin.com>" });
  assert.equal(sent?.kind, "applied");
  // Bulk ATS mail: a clear rejection still counts…
  const bulkReject = classifyEmail("Update on your application", "We have decided to move forward with other candidates.", { from: "Acme <no-reply@greenhouse.io>", bulk: true });
  assert.deepEqual([bulkReject?.kind, bulkReject?.confidence], ["rejected", "high"]);
  // …but a vague one in mass mail doesn't.
  assert.equal(classifyEmail("Hiring update", "Unfortunately the recruiting event is postponed.", { bulk: true }), null);
});

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
