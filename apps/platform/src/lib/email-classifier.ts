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

/** Words that tie an email to a job application — weak signals need one to count. */
const APPLICATION_CONTEXT =
  /\b(?:your (?:application|candidacy|profile|resume|cv)|you(?:'ve| have)? applied|applying (?:for|to)|(?:the|this) (?:position|role|opening|vacancy)|hiring (?:team|manager|process)|recruit(?:er|ing|ment)|talent (?:acquisition|team)|interview(?:er|ing)? (?:panel|process|round|slot)|candidate)\b/i;

/** Job alerts, digests and newsletters: about jobs, but never an update on one of yours. */
const DIGEST_SUBJECT =
  /\b(?:new jobs?\b|jobs? (?:for you|you may|matching|alert|near|picked)|job alerts?|recommended (?:jobs|for you|roles)|(?:is|are) hiring|top (?:jobs|companies)|\d+\+? (?:new )?(?:jobs|openings|roles|opportunities)|newsletter|digest|webinar|don'?t miss|people you may know|trending|this week in|weekly (?:roundup|update))/i;

/**
 * Senders that only send alerts, digests and community mail. LinkedIn's application
 * confirmations (jobs-noreply) and recruiter messages (messages-noreply, inmail) are kept.
 */
const NOISE_SENDER =
  /(?:newsletters?|digest|jobalerts?|job-alerts?|jobs-listings|alerts?|groups|editors|news|marketing|promotions?|invitations|updates)(?:-noreply)?@|@(?:e\.|em\.|mail\.|email\.)?(?:medium\.com|substack\.com|quora\.com)|hi\.wellfound\.com|@(?:jobalerts?|alerts)\./i;

/** Extra facts about an email besides its text (all optional). */
export interface EmailMeta {
  /** The From header, e.g. "LinkedIn <newsletters-noreply@linkedin.com>". */
  from?: string;
  /** Sent in bulk (a List-Unsubscribe / List-Id header, or Precedence: bulk). */
  bulk?: boolean;
}

/** Mail that's about jobs in general rather than one of yours. */
export function isNoise(subject: string, meta: EmailMeta = {}): boolean {
  return DIGEST_SUBJECT.test(subject) || (meta.from ? NOISE_SENDER.test(meta.from) : false);
}

function clip(text: string) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 140 ? `${t.slice(0, 137)}…` : t;
}

/**
 * Classify one email. Returns null when it doesn't look like an update on an application:
 * alerts, digests and newsletters are skipped; a weak signal ("unfortunately", "interview")
 * only counts when the email is about an application; mass mail needs a strong signal.
 */
export function classifyEmail(subject: string, body: string, meta: EmailMeta = {}): EmailClassification | null {
  if (isNoise(subject, meta)) return null;
  const text = `${subject}\n${body}`;
  const aboutApplication = APPLICATION_CONTEXT.test(text);
  const hits = RULES.map((rule) => ({ rule, match: text.match(rule.pattern) })).filter(
    (h) => h.match && (h.rule.confidence === "high" || (aboutApplication && !meta.bulk)),
  );
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
