// Basic facts read from resume text for onboarding: name, current role and years of
// experience. Pattern-based, no AI — so each is a best guess that only pre-fills a field
// the person then checks. Pure (tested in scripts/resume-facts.test.mjs).

export interface ResumeFacts {
  name?: string;
  /** Title of the job marked "Present", e.g. "Software Engineer". */
  currentRole?: string;
  /** Whole years across the jobs under Experience (overlaps counted once). */
  experienceYears?: number;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?`;
const POINT = String.raw`(?:${MONTH}\s*'?\d{2,4}|\d{1,2}\s*/\s*\d{4}|\d{4})`;
const NOW = String.raw`(?:present|current(?:ly)?|now|till\s+date|to\s+date|ongoing)`;
const RANGE = new RegExp(String.raw`(${POINT})\s*(?:-|–|—|to|till|until)\s*(${POINT}|${NOW})`, "gi");
const NOW_RE = new RegExp(String.raw`\b${NOW}\b`, "i");

const TITLE_WORD = String.raw`(?:engineer|developer|analyst|scientist|consultant|architect|designer|manager|intern|specialist|administrator|tester|programmer|lead|sde(?:[\s-]*(?:i{1,3}|\d))?|sdet|researcher|associate|trainee)`;
// The whole segment is a job title: up to 5 words ending in a title word ("Senior AI Engineer").
const TITLE = new RegExp(String.raw`^(?:[A-Za-z][\w+#./&()-]*\s+){0,5}${TITLE_WORD}(?:\s+(?:i{1,3}|\d))?$`, "i");

const SECTION = /^(?:work\s+|professional\s+)?(?:experience|employment(?:\s+history)?|work\s+history|career)\s*:?$/i;
const OTHER_SECTION = /^(?:education|academics?|projects?|personal\s+projects|skills|technical\s+skills|certifications?|achievements|awards|publications|languages|interests|summary|profile|objective|contact)\s*:?$/i;
const EDUCATION = /\b(?:b\.?\s?tech|m\.?\s?tech|b\.?\s?e\b|bachelor|master|mba|b\.?sc|m\.?sc|ph\.?d|university|college|institute|school|cgpa|gpa)\b/i;

/** Month count since year 0 for a date like "Jan 2024", "01/2024", "2024" or "Present". */
function toMonth(raw: string, now: Date, isEnd: boolean): number | null {
  const s = raw.trim().toLowerCase();
  if (NOW_RE.test(s)) return now.getFullYear() * 12 + now.getMonth();
  const slash = /^(\d{1,2})\s*\/\s*(\d{4})$/.exec(s);
  if (slash) return Number(slash[2]) * 12 + Math.min(11, Math.max(0, Number(slash[1]) - 1));
  const year = /(\d{4}|'?\d{2})$/.exec(s)?.[1];
  if (!year) return null;
  const y = year.length === 4 ? Number(year) : 2000 + Number(year.replace("'", ""));
  const m = MONTHS.findIndex((mo) => s.startsWith(mo));
  // A bare year: count it from January to December.
  return y * 12 + (m >= 0 ? m : isEnd ? 11 : 0);
}

/** Split a line into its parts: "Software Engineer | Acme — Jan 2024 – Present". */
function segments(line: string): string[] {
  return line
    .replace(RANGE, " | ")
    .split(/\s*(?:\||•|·|,|\s{2,}|\s[-–—]\s|\s@\s|\sat\s)\s*/i)
    .map((s) => s.replace(/^[\s•\-–—*:]+|[\s,:]+$/g, ""))
    .filter(Boolean);
}

const isBullet = (line: string) => /^\s*(?:[•\-–*▪●◦]|\d+\.)\s/.test(line) || line.trim().split(/\s+/).length > 14;

function titleIn(line: string): string | undefined {
  if (isBullet(line)) return undefined;
  return segments(line).find((s) => TITLE.test(s) && !EDUCATION.test(s));
}

function guessName(lines: string[]): string | undefined {
  for (const line of lines.slice(0, 6)) {
    const t = line.trim().split(/\s{2,}|\s*\|\s*/)[0];
    const words = t.split(/\s+/);
    if (
      words.length >= 1 && words.length <= 4 &&
      words.every((w) => /^[A-Z][A-Za-z.'-]*$/.test(w)) &&
      !/resume|curriculum|vitae|\bcv\b/i.test(t) &&
      !TITLE.test(t) && !SECTION.test(t) && !OTHER_SECTION.test(t)
    ) {
      // "DHRUV SAGAR" → "Dhruv Sagar"
      return t === t.toUpperCase() ? t.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : t;
    }
  }
  return undefined;
}

export function resumeFacts(text: string, now = new Date()): ResumeFacts {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim());
  const facts: ResumeFacts = {};

  const name = guessName(lines);
  if (name) facts.name = name;

  // The Experience section, if the resume has a heading for it.
  const start = lines.findIndex((l) => SECTION.test(l.trim()));
  let section = lines;
  if (start >= 0) {
    const end = lines.findIndex((l, i) => i > start && OTHER_SECTION.test(l.trim()));
    section = lines.slice(start + 1, end > start ? end : undefined);
  }

  // Current role: the title on (or next to) the line that says "Present".
  for (let i = 0; i < section.length && !facts.currentRole; i++) {
    if (!NOW_RE.test(section[i]) || !new RegExp(RANGE.source, "i").test(section[i])) continue;
    for (const j of [i, i - 1, i + 1, i - 2, i + 2]) {
      const title = section[j] !== undefined ? titleIn(section[j]) : undefined;
      if (title) {
        facts.currentRole = title;
        break;
      }
    }
  }

  // Years: date ranges of jobs (not degrees), overlaps counted once.
  const spans: Array<[number, number]> = [];
  section.forEach((line, i) => {
    // No Experience heading: skip dates on (or right next to) a degree, unless the line names a job.
    if (start < 0 && !titleIn(line)) {
      const near = [section[i - 1], line, section[i + 1]].filter(Boolean).join(" ");
      if (EDUCATION.test(near)) return;
    }
    for (const m of line.matchAll(RANGE)) {
      const from = toMonth(m[1], now, false);
      const to = toMonth(m[2], now, true);
      if (from !== null && to !== null && to >= from && to - from < 50 * 12) spans.push([from, to + 1]);
    }
  });
  if (spans.length) {
    spans.sort((a, b) => a[0] - b[0]);
    let months = 0;
    let [curFrom, curTo] = spans[0];
    for (const [from, to] of spans.slice(1)) {
      if (from <= curTo) curTo = Math.max(curTo, to);
      else {
        months += curTo - curFrom;
        [curFrom, curTo] = [from, to];
      }
    }
    months += curTo - curFrom;
    facts.experienceYears = Math.floor(months / 12);
  }
  return facts;
}
