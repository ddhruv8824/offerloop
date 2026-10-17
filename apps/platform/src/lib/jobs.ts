/**
 * Job Finder: shared types and the pure "clean + score" logic.
 *
 * Collecting jobs happens on the server (src/lib/server/jobs); this file has no
 * server or browser dependencies, so it runs anywhere and under plain Node tests.
 */

// Type-only: erased at runtime, so this file still has no runtime dependencies.
import type { CompanyInfo, SalaryLpa } from "./company-info";

export type JobSource ="Hirist" | "Ashby" | "SmartRecruiters" | "Greenhouse" | "Lever" | "Link";

/** One open role, normalised from any source. */
export interface FoundJob {
  /** Stable across fetches: `<source>:<company>:<id>`. */
  id: string;
  source: JobSource;
  company: string;
  title: string;
  /** Human-readable, e.g. "Bengaluru, India" or "Pune / Remote". */
  location: string;
  remote: boolean;
  url: string;
  postedAt?: string;
  /** Skills the posting asks for. `required` when the source marks them mandatory. */
  skills: { name: string; required?: boolean }[];
  minExperience?: number;
  maxExperience?: number;
  /** Pay in LPA when the posting states it; `min` is 0 for "up to X". */
  salaryLpa?: SalaryLpa;
  /** Whether that pay came from the posting's own salary field or was read from its text. */
  salarySource?: "posting" | "description";
  /** What the company is like to work at, when the source provides it. */
  companyInfo?: CompanyInfo;
  /** True when the source only lists India roles (Hirist, or a board filtered to India). */
  inIndia?: boolean;
  /** Plain text of the posting; used for scoring, trimmed before leaving the server. */
  description?: string;
}

export interface SearchProfile {
  targetRole: string;
  skills: string[];
  locations: string[];
  experienceYears: number;
  minSalaryLpa?: number;
  /** Current pay in LPA, when the person shared it. */
  currentCtcLpa?: number;
  dealBreakers: string[];
}

/** One area of the fit breakdown (skills, role, experience, location, pay). */
export interface FitArea {
  key: "skills" | "role" | "experience" | "location" | "pay";
  label: string;
  /** 0–100; absent when the posting doesn't say (e.g. no pay stated). */
  score?: number;
  status: "good" | "ok" | "weak" | "unknown";
  note: string;
}

export type FitVerdict = "Strong fit" | "Good fit" | "Worth a try" | "Long shot";

/** Why a job scored what it did, in plain words. */
export interface JobFit {
  verdict: FitVerdict;
  areas: FitArea[];
  /** Up to 3 reasons it fits. */
  strengths: string[];
  /** Up to 3 things that count against it. */
  gaps: string[];
}

export interface ScoredJob extends Omit<FoundJob, "description"> {
  score: number;
  fit: JobFit;
  /** The deal-breaker this job hits. Such jobs are kept out of results (shown only on request). */
  vetoed?: string;
  matched: string[];
  missing: string[];
  /** Things to know before applying: experience gap, salary, deal-breakers. */
  flags: string[];
  snippet?: string;
  /** Scored from the title alone (the source gave no skills or description). */
  limitedInfo?: boolean;
  /** Other sources listing the same role. */
  alsoOn: JobSource[];
}

/* ── Skills ───────────────────────────────────────────── */

// Canonical name → pattern. Word boundaries are handled by `skillRegex`.
const SKILL_PATTERNS: [string, string][] = [
  ["React", "react(?:\\.?js)?"],
  ["Next.js", "next\\.?js"],
  ["TypeScript", "typescript"],
  ["JavaScript", "javascript|ecmascript|es6"],
  ["Angular", "angular(?:\\.?js)?"],
  ["Vue", "vue(?:\\.?js)?"],
  ["Svelte", "svelte"],
  ["Redux", "redux"],
  ["HTML", "html5?"],
  ["CSS", "css3?"],
  ["Tailwind CSS", "tailwind(?:\\s?css)?"],
  ["Sass", "sass|scss"],
  ["Webpack", "webpack"],
  ["Vite", "vite"],
  ["Jest", "jest"],
  ["Cypress", "cypress"],
  ["Playwright", "playwright"],
  ["Testing Library", "(?:react )?testing library"],
  ["GraphQL", "graphql"],
  ["REST APIs", "rest(?:ful)?(?: api)?s?"],
  ["Node.js", "node(?:\\.?js)?"],
  ["Express", "express(?:\\.?js)?"],
  ["NestJS", "nest\\.?js"],
  ["Python", "python"],
  ["Django", "django"],
  ["Flask", "flask"],
  ["FastAPI", "fastapi"],
  ["Java", "java(?!script)"],
  ["Spring Boot", "spring(?:\\s?boot)?"],
  ["Kotlin", "kotlin"],
  ["Go", "golang|go(?=\\s*(?:lang|,|/|\\)|and\\b|or\\b))"],
  ["Rust", "rust"],
  ["C++", "c\\+\\+"],
  ["C#", "c#|\\.net(?: core)?"],
  ["Ruby on Rails", "ruby on rails|rails|ruby"],
  ["PHP", "php|laravel"],
  ["Swift", "swift(?:ui)?"],
  ["React Native", "react native"],
  ["Flutter", "flutter"],
  ["Android", "android"],
  ["iOS", "ios"],
  ["SQL", "sql"],
  ["PostgreSQL", "postgres(?:ql)?"],
  ["MySQL", "mysql"],
  ["MongoDB", "mongo(?:db)?"],
  ["Redis", "redis"],
  ["Elasticsearch", "elastic\\s?search"],
  ["Kafka", "kafka"],
  ["RabbitMQ", "rabbitmq"],
  ["Docker", "docker"],
  ["Kubernetes", "kubernetes|k8s"],
  ["AWS", "aws|amazon web services"],
  ["GCP", "gcp|google cloud"],
  ["Azure", "azure"],
  ["Terraform", "terraform"],
  ["CI/CD", "ci\\s?/\\s?cd|jenkins|github actions"],
  ["Linux", "linux"],
  ["Git", "git(?:hub|lab)?"],
  ["Microservices", "micro-?services"],
  ["System Design", "system design|distributed systems"],
  ["Machine Learning", "machine learning|\\bml\\b"],
  ["Deep Learning", "deep learning"],
  ["PyTorch", "pytorch"],
  ["TensorFlow", "tensorflow"],
  ["NLP", "nlp|natural language processing"],
  ["LLMs", "llms?|large language models?|generative ai|gen\\s?ai"],
  ["LangChain", "langchain"],
  ["LangGraph", "langgraph"],
  ["RAG", "rag|retrieval[- ]augmented"],
  ["Pandas", "pandas"],
  ["Spark", "(?:py)?spark"],
  ["Airflow", "airflow"],
  ["dbt", "dbt"],
  ["Snowflake", "snowflake"],
  ["Tableau", "tableau"],
  ["Power BI", "power\\s?bi"],
  ["Figma", "figma"],
  ["Accessibility", "accessibility|a11y|wcag"],
  ["Agile", "agile|scrum"],
];

const skillRegex = (pattern: string) => new RegExp(`(?<![A-Za-z0-9+#.])(?:${pattern})(?![A-Za-z0-9+#])`, "i");
const SKILLS = SKILL_PATTERNS.map(([name, pattern]) => ({ name, re: skillRegex(pattern) }));

/** Skills mentioned in free text (a job description, or one skill tag). */
export function extractSkills(text: string): string[] {
  return SKILLS.filter((s) => s.re.test(text)).map((s) => s.name);
}

/** Canonical name for a skill a user or a job board typed ("React.js" → "React"). */
export function canonicalSkill(raw: string): string {
  if (typeof raw !== "string") return "";
  const hit = SKILLS.find((s) => s.re.test(raw) && raw.trim().length <= s.name.length + 8);
  return hit?.name ?? raw.trim();
}

/* ── Role relevance ───────────────────────────────────── */

// What a title says the role IS. Checked first.
const ROLE_FAMILIES: Record<string, RegExp> = {
  frontend: /front[\s-]?end|\bui (?:engineer|developer)|web (?:developer|engineer)/i,
  backend: /back[\s-]?end|server[\s-]?side|\bapi (?:engineer|developer)/i,
  fullstack: /full[\s-]?stack|product engineer/i,
  mobile: /mobile|android|\bios\b|react native|flutter/i,
  data: /data (?:engineer|analyst|scientist)|analytics|\betl\b|business intelligence/i,
  ml: /machine learning|\bml\b|\bai\b|deep learning|\bnlp\b|\bllm|applied scientist|research (?:engineer|scientist)/i,
  devops: /devops|\bsre\b|site reliability|infrastructure|cloud engineer|platform engineer/i,
  qa: /\bqa\b|quality|\btest(?:ing|er)?\b|\bsdet\b|automation engineer|validation/i,
  security: /security|\bsoc\b|penetration/i,
  hardware: /hardware|embedded|firmware|\bvlsi\b|\basic\b|\bfpga\b|mechanical|electrical|controls? (?:software|engineer)/i,
};
// A technology in the title only hints at the kind of role, and only when the title says nothing clearer
// ("React Developer" is frontend; "Test Engineer - Python" is still a test role).
const TECH_HINTS: Record<string, RegExp> = {
  frontend: /\breact|\bangular|\bvue|javascript|typescript|next\.?js/i,
  backend: /\bjava\b|\bnode|\bpython|golang|\bspring|\.net|\bruby|\bphp/i,
};
const GENERIC_ENGINEER = /software (?:engineer|developer)|\bsde\b|\bswe\b|developer|programmer|member of technical staff|\bmts\b/i;
// "Content Developer" and "Information Developer" are writing roles, not software ones.
const NOT_ENGINEERING =
  /\b(sales|account executive|recruit|marketing|finance|legal|counsel|hr\b|people partner|customer success|support specialist|accountant|operations manager|business development|technical writer|content (?:developer|writer|designer)|information developer|curriculum|instructional|trainer)\b/i;

function families(text: string) {
  const t = text.replace(/[_/]+/g, " ");
  const explicit = Object.entries(ROLE_FAMILIES).filter(([, re]) => re.test(t)).map(([name]) => name);
  if (explicit.length) return explicit;
  return Object.entries(TECH_HINTS).filter(([, re]) => re.test(t)).map(([name]) => name);
}

/** 0–1: how well a job title fits the role the user wants. */
export function roleRelevance(title: string, targetRole: string): number {
  if (NOT_ENGINEERING.test(title) && !NOT_ENGINEERING.test(targetRole)) return 0;
  const want = families(targetRole);
  const have = families(title);
  if (want.some((f) => have.includes(f))) return 1;
  // A general target ("Software Engineer") is open to any kind of engineering role.
  if (want.length === 0 && GENERIC_ENGINEER.test(targetRole) && (have.length > 0 || GENERIC_ENGINEER.test(title))) return 0.85;
  // Full-stack people fit frontend and backend roles, and the other way round.
  const stack = ["frontend", "backend", "fullstack"];
  if (want.some((f) => stack.includes(f)) && have.some((f) => stack.includes(f))) return 0.7;
  const words = targetRole.toLowerCase().split(/\W+/).filter((w) => w.length > 3 && !/engineer|developer|senior|junior/.test(w));
  if (words.length && words.every((w) => title.toLowerCase().includes(w))) return 1;
  // A plain "Software Engineer" could be anything; a clearly different specialty is a long shot.
  if (GENERIC_ENGINEER.test(title.replace(/[_/]+/g, " ")) && (want.length > 0 || GENERIC_ENGINEER.test(targetRole))) return have.length ? 0.25 : 0.55;
  return 0;
}

/* ── Location ─────────────────────────────────────────── */

const CITY_ALIASES: Record<string, RegExp> = {
  bangalore: /bengaluru|bangalore/i,
  bengaluru: /bengaluru|bangalore/i,
  gurgaon: /gurgaon|gurugram/i,
  gurugram: /gurgaon|gurugram/i,
  "delhi ncr": /delhi|noida|gurgaon|gurugram|faridabad|ghaziabad|\bncr\b/i,
  delhi: /delhi|\bncr\b/i,
  mumbai: /mumbai|bombay|navi mumbai|thane/i,
};
const INDIA = /india|bengaluru|bangalore|pune|mumbai|hyderabad|gurgaon|gurugram|noida|delhi|chennai|kolkata|ahmedabad|jaipur|kochi|indore|chandigarh|coimbatore/i;
const ELSEWHERE = /united states|\busa?\b|\buk\b|united kingdom|canada|europe|\bemea\b|germany|france|netherlands|ireland|australia|singapore|japan|brazil|mexico|latam|poland|spain|israel|dubai|uae/i;

/** "exact" = one of the user's cities, "remote" = remote and open to India, null = not for them. */
export function locationFit(job: Pick<FoundJob, "location" | "remote" | "inIndia">, wanted: string[]): "exact" | "remote" | null {
  const loc = job.location;
  for (const city of wanted) {
    if (/remote/i.test(city)) continue;
    const re = CITY_ALIASES[city.toLowerCase()] ?? new RegExp(city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    if (re.test(loc)) return "exact";
  }
  const wantsRemote = wanted.some((c) => /remote/i.test(c));
  if (job.remote || /remote|work from home|anywhere/i.test(loc)) {
    // Remote only counts when it's clearly open to India. "Remote - US" isn't, and neither is a
    // "remote-friendly" role that names only a foreign city ("San Francisco").
    const place = loc.replace(/remote|hybrid|work from home|not specified|[\s,/()|-]+/gi, "");
    const openToIndia = job.inIndia || INDIA.test(loc) || /apac|asia|global|worldwide|anywhere/i.test(loc) || (place === "" && !ELSEWHERE.test(loc));
    if (openToIndia && (wantsRemote || wanted.length === 0)) return "remote";
  }
  if (wanted.length === 0 && (job.inIndia || INDIA.test(loc))) return "exact";
  return null;
}

/* ── Experience ───────────────────────────────────────── */

/** Minimum years a posting asks for, from text like "3+ years" or "4-6 yrs of experience". */
export function parseMinExperience(text: string): number | undefined {
  const found: number[] = [];
  const re = /(\d{1,2})\s*(?:\+|(?:-|–|to)\s*\d{1,2})?\s*\+?\s*(?:years?|yrs?)/gi;
  for (const m of text.matchAll(re)) {
    const n = Number(m[1]);
    const around = text.slice(Math.max(0, m.index! - 60), m.index! + 80).toLowerCase();
    // Skip "10 years in business", "founded 5 years ago", benefits, etc.
    if (n <= 20 && /experience|exp\b|background|hands[- ]on|working with|industry/.test(around)) found.push(n);
  }
  return found.length ? Math.min(...found) : undefined;
}

function seniorityFloor(title: string): number | undefined {
  if (/\bintern|trainee|graduate\b/i.test(title)) return 0;
  if (/\b(principal|staff|architect|director|head of)\b/i.test(title)) return 8;
  if (/\b(lead|manager)\b/i.test(title)) return 6;
  if (/\b(senior|sr\.?|sde[\s-]?(?:ii|2|iii|3)|engineer (?:ii|iii))\b/i.test(title)) return 3;
  return undefined;
}

/* ── Score ────────────────────────────────────────────── */

export function verdictFor(score: number): FitVerdict {
  return score >= 80 ? "Strong fit" : score >= 65 ? "Good fit" : score >= 50 ? "Worth a try" : "Long shot";
}

const status = (score: number): FitArea["status"] => (score >= 80 ? "good" : score >= 55 ? "ok" : "weak");
const listed = (names: string[], max = 3) => names.slice(0, max).join(", ") + (names.length > max ? ` +${names.length - max} more` : "");
const lpa = (range: SalaryLpa) => (range[0] ? `${range[0]}–${range[1]} LPA` : `up to ${range[1]} LPA`);

/**
 * A deal-breaker the person wrote themselves ("No crypto", "No startups") that isn't one of
 * the known ones: it rules a job out when its title or company names it. Only mentioned in
 * the description, it's a warning — descriptions mention all sorts of things in passing.
 */
function customDealBreaker(dealBreaker: string, job: FoundJob): "veto" | "flag" | null {
  const term = dealBreaker.replace(/^\s*(no|not|avoid|never)\s+/i, "").trim();
  if (term.length < 3 || DEAL_BREAKER_SIGNALS.some(([mine]) => mine.test(dealBreaker)) || /remote only/i.test(dealBreaker)) return null;
  // "startups" should also catch "startup": match the term with an optional plural ending.
  const stem = term.replace(/s$/i, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${stem}s?\\b`, "i");
  // Company names often run words together ("CoinCrypto"), so any part of the name counts.
  if (re.test(job.title) || job.company.toLowerCase().includes(term.replace(/s$/i, "").toLowerCase())) return "veto";
  if (re.test(job.description ?? "")) return "flag";
  return null;
}

const DEAL_BREAKER_SIGNALS: [RegExp, RegExp, string][] = [
  [/night/i, /night shift|rotational shift|24\s?[x/]\s?7 shift|us shift|uk shift/i, "Mentions night or rotational shifts"],
  [/bond/i, /service bond|bond period|service agreement of|minimum commitment of/i, "Mentions a service bond"],
  [/relocat/i, /must relocate|relocation (?:is )?required|willing to relocate/i, "Asks you to relocate"],
  [/6-day|six/i, /6[- ]day work|six[- ]day|saturdays? working/i, "Mentions a 6-day week"],
  [/service compan/i, /staffing|outsourcing|it services|consulting services/i, "Looks like a services company"],
];

/**
 * Score one job for one person. Weights: skills 45, role 25, experience 15, location 15.
 * Returns null when the job isn't relevant at all (wrong kind of role, or wrong place) —
 * unless `keepAll` is set (a job the user pasted themselves is always scored and shown).
 */
export function scoreJob(job: FoundJob, profile: SearchProfile, { keepAll = false } = {}): ScoredJob | null {
  const relevance = roleRelevance(job.title, profile.targetRole);
  if (relevance === 0 && !keepAll) return null;
  const place = locationFit(job, profile.locations);
  if (!place && !keepAll) return null;

  const text = `${job.title}\n${job.description ?? ""}`;
  const have = new Set(profile.skills.map((s) => canonicalSkill(s).toLowerCase()));
  const asked: FoundJob["skills"] = job.skills.length ? job.skills : extractSkills(text).map((name) => ({ name }));
  const names = [...new Set(asked.map((s) => canonicalSkill(s.name)))].filter(Boolean);
  const matched = names.filter((n) => have.has(n.toLowerCase()));
  const missing = names.filter((n) => !have.has(n.toLowerCase()));
  // Mandatory skills count double; with no skills listed we can't judge, so stay neutral.
  const weight = (n: string) => (asked.find((s) => canonicalSkill(s.name) === n)?.required ? 2 : 1);
  const total = names.reduce((sum, n) => sum + weight(n), 0);
  // Pulled toward the middle until a posting lists enough skills to be sure: having 1 of 1 listed
  // skills says less than having 5 of 6, so it shouldn't outrank it.
  const NEUTRAL = 0.5;
  const PRIOR = 3;
  const matchedWeight = matched.reduce((sum, n) => sum + weight(n), 0);
  // With only a title to go on (no skill list, no description) we know very little:
  // stay below neutral, with a small lift if the title itself names a skill you have.
  const titleOnly = job.skills.length === 0 && !(job.description ?? "").trim();
  // …and a drop if the title names skills and you have none of them ("Angular Developer" for a React person).
  const titleOnlyFit = total ? 0.25 + 0.25 * (matchedWeight / total) : 0.4;
  const skillFit = titleOnly ? titleOnlyFit : (matchedWeight + NEUTRAL * PRIOR) / (total + PRIOR);

  const minExp = job.minExperience ?? parseMinExperience(text) ?? seniorityFloor(job.title);
  const gap = minExp === undefined ? 0 : minExp - profile.experienceYears;
  const over = job.maxExperience !== undefined ? profile.experienceYears - job.maxExperience : 0;
  const expFit = gap <= 0 ? (over > 3 ? 0.6 : 1) : gap <= 1 ? 0.7 : gap <= 2 ? 0.4 : 0.1;

  const raw = 45 * skillFit + 25 * relevance + 15 * expFit + 15 * (place === "exact" ? 1 : place === "remote" ? 0.85 : 0);
  // Being years short is close to disqualifying however well the skills line up, so it caps the score.
  const cap = gap >= 3 ? 45 : gap >= 2 ? 62 : 100;
  // A posting left open for many months is often an "always hiring" listing, not one live opening.
  const ageDays = job.postedAt ? (Date.now() - Date.parse(job.postedAt)) / 86_400_000 : 0;
  const stalePenalty = ageDays > 365 ? 10 : ageDays > 180 ? 5 : 0;
  const score = Math.round(Math.min(raw, cap)) - stalePenalty;

  const flags: string[] = [];
  if (stalePenalty) flags.push(`Posted ${ageDays > 365 ? "over a year" : "over 6 months"} ago — may be an always-open listing, not a live opening`);
  if (relevance === 0) flags.push(`Doesn't look like a ${profile.targetRole} role`);
  if (!place) flags.push("Not in the locations on your profile");
  if (gap >= 1 && minExp !== undefined) flags.push(`Asks for ${minExp}+ years; you have ${profile.experienceYears}`);
  if (over > 3) flags.push(`Aimed at up to ${job.maxExperience} years; you have ${profile.experienceYears}`);
  if (profile.minSalaryLpa && job.salaryLpa && job.salaryLpa[1] < profile.minSalaryLpa) {
    flags.push(`Top of range (${job.salaryLpa[1]} LPA) is below your ${profile.minSalaryLpa} LPA minimum`);
  }
  // A clearly low employee rating is worth knowing before applying — but only when enough
  // people reviewed for it to mean something. It warns; it doesn't change the match score.
  const rating = job.companyInfo?.rating;
  const reviews = job.companyInfo?.reviewsCount ?? 0;
  if (rating !== undefined && rating < 3 && reviews >= 10) flags.push(`Employees rate this company ${rating} out of 5 (${reviews} reviews)`);

  // Deal-breakers rule a job out, as the person asked; a guess from the description alone
  // (pay read from the text, a custom term mentioned in passing) only warns.
  let vetoed: string | undefined;
  for (const [mine, inJob, label] of DEAL_BREAKER_SIGNALS) {
    if (profile.dealBreakers.some((d) => mine.test(d)) && inJob.test(text)) vetoed ??= label;
  }
  if (profile.dealBreakers.some((d) => /remote only/i.test(d)) && place !== "remote" && !job.remote) vetoed ??= "Not a remote role";
  for (const d of profile.dealBreakers) {
    const hit = customDealBreaker(d, job);
    if (hit === "veto") vetoed ??= `Hits your deal-breaker “${d}”`;
    else if (hit === "flag") flags.push(`Mentions something on your deal-breaker list (“${d}”)`);
  }
  const payTooLow = Boolean(profile.minSalaryLpa && job.salaryLpa && job.salaryLpa[1] < profile.minSalaryLpa);
  if (payTooLow && job.salarySource === "posting") vetoed ??= `Pays at most ${job.salaryLpa![1]} LPA, below your ${profile.minSalaryLpa} LPA minimum`;

  const { description, ...rest } = job;
  return {
    ...rest,
    skills: names.map((name) => ({ name, required: asked.find((s) => canonicalSkill(s.name) === name)?.required })),
    minExperience: minExp,
    score: Math.max(0, Math.min(100, score)),
    fit: explainFit({ job, profile, score: Math.max(0, Math.min(100, score)), skillFit, titleOnly, names, matched, missing, required: names.filter((n) => weight(n) === 2), relevance, minExp, gap, over, expFit, place, payTooLow }),
    vetoed,
    matched,
    missing,
    flags,
    snippet: description ? description.replace(/\s+/g, " ").trim().slice(0, 240) : undefined,
    limitedInfo: titleOnly || undefined,
    alsoOn: [],
  };
}

/** The fit breakdown: one line per area, a verdict, and the main reasons for and against. */
function explainFit(f: {
  job: FoundJob;
  profile: SearchProfile;
  score: number;
  skillFit: number;
  titleOnly: boolean;
  names: string[];
  matched: string[];
  missing: string[];
  required: string[];
  relevance: number;
  minExp: number | undefined;
  gap: number;
  over: number;
  expFit: number;
  place: "exact" | "remote" | null;
  payTooLow: boolean;
}): JobFit {
  const { job, profile } = f;
  const areas: FitArea[] = [];
  const strengths: string[] = [];
  const gaps: string[] = [];

  // Skills
  const skills = Math.round(f.skillFit * 100);
  const missingRequired = f.missing.filter((n) => f.required.includes(n));
  areas.push({
    key: "skills",
    label: "Skills",
    score: f.titleOnly || !f.names.length ? undefined : skills,
    status: f.titleOnly || !f.names.length ? "unknown" : status(skills),
    note: f.titleOnly
      ? "Only the title to go on"
      : f.names.length
        ? `You have ${f.matched.length} of the ${f.names.length} skills it asks for`
        : "The posting doesn't list skills",
  });
  if (f.matched.length >= 2 && skills >= 60) strengths.push(`Has ${f.matched.length} of ${f.names.length} skills it asks for: ${listed(f.matched)}`);
  if (missingRequired.length) gaps.push(`Missing must-have skill${missingRequired.length > 1 ? "s" : ""}: ${listed(missingRequired)}`);
  else if (f.missing.length && skills < 60) gaps.push(`Asks for ${listed(f.missing)}, which your profile doesn't list`);

  // Role
  const role = Math.round(f.relevance * 100);
  areas.push({
    key: "role",
    label: "Role",
    score: role,
    status: status(role),
    note: f.relevance >= 1 ? `A ${profile.targetRole} role` : f.relevance >= 0.7 ? `Close to ${profile.targetRole}` : f.relevance > 0 ? "A different kind of engineering role" : `Not a ${profile.targetRole} role`,
  });
  if (f.relevance >= 1) strengths.push(`The kind of role you want (${profile.targetRole})`);
  else if (f.relevance < 0.7) gaps.push(`Not quite the role you want (${profile.targetRole})`);

  // Experience
  const exp = Math.round(f.expFit * 100);
  areas.push({
    key: "experience",
    label: "Experience",
    score: f.minExp === undefined ? undefined : exp,
    status: f.minExp === undefined ? "unknown" : status(exp),
    note:
      f.minExp === undefined
        ? "Years not stated"
        : f.gap > 0
          ? `Asks for ${f.minExp}+ years; you have ${profile.experienceYears}`
          : f.over > 3
            ? `Aimed at up to ${job.maxExperience} years; you have ${profile.experienceYears}`
            : `Asks for ${f.minExp}+ years; you have ${profile.experienceYears}`,
  });
  if (f.minExp !== undefined && f.gap <= 0 && f.over <= 3) strengths.push(`Your ${profile.experienceYears} years meet its ${f.minExp}+ ask`);
  if (f.gap >= 1) gaps.push(`${f.gap} year${f.gap > 1 ? "s" : ""} short of the ${f.minExp}+ it asks for`);

  // Location
  areas.push({
    key: "location",
    label: "Location",
    score: f.place === "exact" ? 100 : f.place === "remote" ? 85 : 0,
    status: f.place ? "good" : "weak",
    note: f.place === "exact" ? job.location : f.place === "remote" ? "Remote, open to India" : "Outside the places on your profile",
  });
  if (!f.place) gaps.push("Not in the places on your profile");

  // Pay — not part of the score (most postings don't state it), but the first thing many look at.
  const range = job.salaryLpa;
  areas.push({
    key: "pay",
    label: "Pay",
    status: !range ? "unknown" : f.payTooLow ? "weak" : "good",
    note: !range
      ? "Not stated"
      : f.payTooLow
        ? `${lpa(range)} — below your ${profile.minSalaryLpa} LPA minimum`
        : `${lpa(range)}${job.salarySource === "description" ? " (read from the description)" : ""}`,
  });
  if (range && !f.payTooLow && profile.minSalaryLpa && range[1] >= profile.minSalaryLpa) strengths.push(`Pays ${lpa(range)}, above your ${profile.minSalaryLpa} LPA minimum`);
  if (f.payTooLow) gaps.push(`Pays ${lpa(range!)}, below your ${profile.minSalaryLpa} LPA minimum`);

  return { verdict: verdictFor(f.score), areas, strengths: strengths.slice(0, 3), gaps: gaps.slice(0, 3) };
}

/* ── Clean ────────────────────────────────────────────── */

const squash = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|inc|llc|technologies|technology|software|india|labs)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Hirist titles are "Company - Role - Extra"; this keeps the role for comparing. */
const coreTitle = (job: Pick<FoundJob, "title" | "company">) => {
  const parts = job.title.split(/\s+[-–|]\s+/).filter((p) => squash(p) !== squash(job.company));
  return squash(parts[0] ?? job.title);
};

/** First city of a location, with spelling variants folded together ("Bengaluru" = "Bangalore"). */
const cityKey = (location: string) => {
  const first = squash(location).split(" ")[0] ?? "";
  return ({ bengaluru: "bangalore", gurugram: "gurgaon", bombay: "mumbai" } as Record<string, string>)[first] ?? first;
};

/**
 * Same role listed by more than one source (e.g. on Hirist and on the company's own
 * careers page) → keep the best-scored copy and note where else it appears.
 */
export function dedupe(jobs: ScoredJob[]): ScoredJob[] {
  const byKey = new Map<string, ScoredJob>();
  // Prefer the company's own posting over a job board when scores tie.
  const rank = (j: ScoredJob) => j.score * 10 + (j.source === "Hirist" ? 0 : 1);
  for (const job of jobs) {
    const key = `${squash(job.company)}|${coreTitle(job)}|${cityKey(job.location)}`;
    const kept = byKey.get(key);
    if (!kept) {
      byKey.set(key, job);
    } else {
      const [best, other] = rank(job) > rank(kept) ? [job, kept] : [kept, job];
      const alsoOn = [...new Set([...best.alsoOn, ...other.alsoOn, other.source])].filter((s) => s !== best.source);
      byKey.set(key, { ...best, alsoOn });
    }
  }
  return [...byKey.values()];
}
