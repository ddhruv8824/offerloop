/**
 * Decide what a job-related email means for an application, from its text.
 *
 * Rule-based on purpose: predictable, testable, no API key needed. Every rule
 * has a confidence. "high" results may move a tracker card automatically;
 * "low" results are only shown as suggestions for the user to confirm.
 *
 * No imports, so it runs in the browser, on the server and under plain Node tests.
 */

export type EmailKind = "applied" | "in_review" | "assessment" | "interview" | "offer" | "rejected";
export type Confidence = "high" | "low";

export interface EmailClassification {
  kind: EmailKind;
  confidence: Confidence;
  /** The phrase that decided it, shown to the user as the reason. */
  evidence: string;
}

interface Rule {
  kind: EmailKind;
  confidence: Confidence;
  pattern: RegExp;
}

// Strongest outcome first: an email that says "thanks for applying … unfortunately"
// is a rejection, not a confirmation.
const PRIORITY: EmailKind[] = ["offer", "rejected", "interview", "assessment", "in_review", "applied"];

const RULES: Rule[] = [
  // Offer
  { kind: "offer", confidence: "high", pattern: /\b(?:pleased|delighted|happy|excited) to (?:offer|extend)\b[^.]{0,60}/i },
  { kind: "offer", confidence: "high", pattern: /\b(?:offer letter|letter of offer)\b/i },
  { kind: "offer", confidence: "low", pattern: /\bjob offer\b/i },

  // Rejected
  {
    kind: "rejected",
    confidence: "high",
    pattern:
      /\b(?:not (?:be )?(?:moving|proceeding|progressing) forward|decided (?:to )?(?:move|go|proceed) forward with other|(?:pursue|proceed with) other candidates|will not be (?:moving|progressing|proceeding)|regret to inform|position has (?:been|now been) filled|not (?:been )?selected|unable to offer you|decided not to (?:proceed|move forward))\b[^.]{0,60}/i,
  },
  { kind: "rejected", confidence: "low", pattern: /\bunfortunately\b[^.]{0,80}/i },

  // Interview
  {
    kind: "interview",
    confidence: "high",
    pattern:
      /\b(?:schedule (?:an |your |a )?(?:interview|call)|invite you (?:to|for) (?:an? )?(?:interview|call|chat)|interview (?:invitation|invite|has been scheduled|is scheduled)|next round of interviews?|move you (?:forward )?to the next (?:round|stage))\b[^.]{0,60}/i,
  },
  { kind: "interview", confidence: "high", pattern: /\b(?:calendly\.com|goodtime\.io|share your availability)\b/i },
  { kind: "interview", confidence: "low", pattern: /\binterview\b[^.]{0,60}/i },

  // Assessment
  {
    kind: "assessment",
    confidence: "high",
    pattern:
      /\b(?:complete (?:the|this|an|our) (?:online )?(?:assessment|coding (?:challenge|test)|test)|take[- ]home (?:assignment|task|challenge)|hackerrank|hackerearth|codility|testgorilla|coderbyte)\b[^.]{0,60}/i,
  },
  { kind: "assessment", confidence: "low", pattern: /\b(?:assessment|assignment)\b[^.]{0,60}/i },

  // In review
  {
    kind: "in_review",
    confidence: "high",
    pattern: /\b(?:(?:is|are) (?:currently )?(?:under review|being reviewed)|you(?:'ve| have) been shortlisted|recruiter (?:has )?viewed your (?:profile|application))\b[^.]{0,60}/i,
  },
  { kind: "in_review", confidence: "low", pattern: /\b(?:reviewing your (?:application|profile|resume)|shortlisted)\b[^.]{0,60}/i },

  // Applied (confirmation)
  {
    kind: "applied",
    confidence: "high",
    pattern:
      /\b(?:thank(?:s| you) for (?:applying|your application|submitting your application)|(?:we(?:'ve| have) )?received your application|application (?:has been )?(?:received|submitted successfully)|successfully applied)\b[^.]{0,60}/i,
  },
];

function clip(text: string) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 140 ? `${t.slice(0, 137)}…` : t;
}

/** Classify one email. Returns null when it doesn't look like an application update. */
export function classifyEmail(subject: string, body: string): EmailClassification | null {
  const text = `${subject}\n${body}`;
  const hits = RULES.map((rule) => ({ rule, match: text.match(rule.pattern) })).filter((h) => h.match);
  if (!hits.length) return null;

  for (const kind of PRIORITY) {
    const forKind = hits.filter((h) => h.rule.kind === kind);
    if (!forKind.length) continue;
    const best = forKind.find((h) => h.rule.confidence === "high") ?? forKind[0];
    // A weak signal for a strong outcome shouldn't hide a strong signal for a weaker one
    // ("Unfortunately the link expired… we received your application").
    if (best.rule.confidence === "low") {
      const strongerElsewhere = hits.find((h) => h.rule.confidence === "high");
      if (strongerElsewhere) {
        return { kind: strongerElsewhere.rule.kind, confidence: "high", evidence: clip(strongerElsewhere.match![0]) };
      }
    }
    return { kind, confidence: best.rule.confidence, evidence: clip(best.match![0]) };
  }
  return null;
}

/** Gmail search for emails worth classifying (job platforms, ATS senders, hiring words). */
export function gmailQuery(companies: string[], days = 30) {
  const senders = [
    "greenhouse.io",
    "greenhouse-mail.io",
    "lever.co",
    "hire.lever.co",
    "ashbyhq.com",
    "myworkday.com",
    "workablemail.com",
    "smartrecruiters.com",
    "hirist.tech",
    "hirist.com",
    "naukri.com",
    "instahyre.com",
    "wellfound.com",
    "linkedin.com",
  ];
  const words = ['"your application"', "interview", "assessment", '"offer letter"', "unfortunately", "shortlisted"];
  const names = companies
    .map((c) => c.replace(/["()]/g, "").trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((c) => `"${c}"`);
  const from = `from:(${senders.join(" OR ")})`;
  const subject = `subject:(${words.join(" OR ")})`;
  const parts = [from, subject, ...(names.length ? [`(${names.join(" OR ")})`] : [])];
  return `newer_than:${days}d (${parts.join(" OR ")}) -in:sent -in:drafts`;
}
