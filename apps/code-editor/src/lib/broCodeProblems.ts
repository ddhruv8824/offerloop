import type { Problem } from "../app/codingProblems";

const BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001/api/v1/code";

export type Difficulty = "Easy" | "Medium" | "Hard";

export interface BroCodeExample {
  example_num: number;
  example_text: string;
  images: string[];
}

export interface BroCodeFunctionTestCase {
  args: Record<string, unknown>;
  expected: unknown;
  label?: string;
  hidden?: boolean;
}

export interface BroCodeProblemSummary {
  title: string;
  problem_id: string;
  frontend_id: string;
  difficulty: Difficulty;
  problem_slug: string;
  topics: string[];
  description?: string;
  examples?: BroCodeExample[];
  constraints?: string[];
  follow_ups?: string[];
  hints?: string[];
  code_snippets?: Record<string, string>;
  solution?: string;
  entry_point?: string;
  test_cases?: BroCodeFunctionTestCase[];
}

export type BroCodeProblemDetail = BroCodeProblemSummary;

/** Repo files use `{paddedId}-{problem_slug}`, e.g. `0001-two-sum`. */
export function getProblemFileSlug(
  problem: Pick<BroCodeProblemSummary, "frontend_id" | "problem_slug">
): string {
  const paddedId = problem.frontend_id.padStart(4, "0");
  return `${paddedId}-${problem.problem_slug}`;
}

export interface ProblemFilters {
  search?: string;
  difficulty?: Difficulty | "All";
  topic?: string | "All";
}

export interface ProblemStats {
  total: number;
  easy: number;
  medium: number;
  hard: number;
  topics: string[];
}

export async function fetchAllProblems(): Promise<BroCodeProblemSummary[]> {
  const res = await fetch(`${BASE}/problems`, {
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch problems: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.questions as BroCodeProblemSummary[];
}

export async function fetchProblemByFileSlug(
  fileSlug: string
): Promise<BroCodeProblemDetail | null> {
  const res = await fetch(`${BASE}/problems/${fileSlug}`);

  if (!res.ok) {
    return null;
  }

  const data = await res.json();

  if (typeof data.solution === "object" && data.solution !== null) {
    data.solution = Object.values(data.solution).join("");
  }

  return data as BroCodeProblemDetail;
}

export async function fetchProblemBySlug(
  problem: Pick<BroCodeProblemSummary, "frontend_id" | "problem_slug">
): Promise<BroCodeProblemDetail | null> {
  return fetchProblemByFileSlug(getProblemFileSlug(problem));
}

export function extractEntryPoint(
  codeSnippets?: Record<string, string>,
  explicit?: string
): string | null {
  if (explicit?.trim()) return explicit.trim();

  const py = codeSnippets?.python3 ?? codeSnippets?.python ?? "";
  const pyMatch = py.match(/def\s+(\w+)\s*\(/);
  if (pyMatch) return pyMatch[1];

  const js = codeSnippets?.javascript ?? "";
  return extractEntryPointFromSource(js, "javascript");
}

/** Resolve method/function name from the active language's starter or user code. */
export function extractEntryPointFromSource(
  source: string,
  lang: string
): string | null {
  if (lang === "python") {
    const pyMatch = source.match(/def\s+(\w+)\s*\(/);
    return pyMatch?.[1] ?? null;
  }

  const jsFn = source.match(/function\s+(\w+)\s*\(/);
  if (jsFn) return jsFn[1];
  const jsVar = source.match(/(?:var|let|const)\s+(\w+)\s*=\s*function/);
  if (jsVar) return jsVar[1];
  const jsArrow = source.match(/(?:var|let|const)\s+(\w+)\s*=\s*\(/);
  if (jsArrow) return jsArrow[1];
  return null;
}

export function detectCodeLanguageMismatch(
  code: string,
  selectedLanguage: string
): string | null {
  const trimmed = code.trim();
  if (!trimmed) return null;

  const looksLikeJs =
    /^\/\*\*/.test(trimmed) ||
    /^\/\//m.test(trimmed) ||
    /^\s*(var|let|const)\s+\w+\s*=/.test(trimmed) ||
    /^\s*function\s+\w+\s*\(/.test(trimmed);

  const looksLikePy =
    /^class\s+Solution/.test(trimmed) || /^\s*def\s+\w+\s*\(/m.test(trimmed);

  if (selectedLanguage === "python" && looksLikeJs && !looksLikePy) {
    return "This code looks like JavaScript. Switch the language to JavaScript in the header, or click Format to reset the Python template.";
  }
  if (selectedLanguage === "javascript" && looksLikePy && !looksLikeJs) {
    return "This code looks like Python. Switch the language to Python in the header, or click Format to reset the JavaScript template.";
  }
  return null;
}

export function broCodeDetailToProblem(detail: BroCodeProblemDetail): Problem {
  const functionTestCases: BroCodeFunctionTestCase[] = (
    detail.test_cases ?? []
  ).map((tc, i) => ({
    args: tc.args,
    expected: tc.expected,
    label: tc.label ?? `Test ${i + 1}`,
    hidden: tc.hidden ?? false,
  }));

  const entryPoint =
    extractEntryPoint(detail.code_snippets, detail.entry_point) ?? undefined;

  return {
    id: getProblemFileSlug(detail),
    title: detail.title,
    difficulty: detail.difficulty,
    description: detail.description ?? "",
    starterCode: {
      python:
        detail.code_snippets?.python3 ??
        detail.code_snippets?.python ??
        "# Write your solution here\n",
      javascript:
        detail.code_snippets?.javascript ??
        "// Write your solution here\n",
    },
    testCases: [],
    functionTestCases,
    entryPoint,
    evaluationMode: functionTestCases.length > 0 ? "function" : "stdin",
    topics: detail.topics,
    examples: detail.examples,
    constraints: detail.constraints,
    hints: detail.hints,
    frontendId: detail.frontend_id,
    source: "brocode",
  };
}

export function broCodeSummaryToListItem(
  summary: BroCodeProblemSummary
): Pick<Problem, "id" | "title" | "difficulty" | "topics" | "frontendId"> {
  return {
    id: getProblemFileSlug(summary),
    title: summary.title,
    difficulty: summary.difficulty,
    topics: summary.topics,
    frontendId: summary.frontend_id,
  };
}

export function getProblemStats(
  problems: BroCodeProblemSummary[]
): ProblemStats {
  const topics = [
    ...new Set(problems.flatMap((p) => p.topics ?? [])),
  ].sort();

  return {
    total: problems.length,
    easy: problems.filter((p) => p.difficulty === "Easy").length,
    medium: problems.filter((p) => p.difficulty === "Medium").length,
    hard: problems.filter((p) => p.difficulty === "Hard").length,
    topics,
  };
}

export function filterProblems(
  problems: BroCodeProblemSummary[],
  filters: ProblemFilters
): BroCodeProblemSummary[] {
  const search = filters.search?.trim().toLowerCase() ?? "";
  const difficulty = filters.difficulty ?? "All";
  const topic = filters.topic ?? "All";

  return problems.filter((p) => {
    if (difficulty !== "All" && p.difficulty !== difficulty) {
      return false;
    }

    if (topic !== "All" && !(p.topics ?? []).includes(topic)) {
      return false;
    }

    if (!search) {
      return true;
    }

    const haystack = [
      p.title,
      p.problem_slug,
      p.frontend_id,
      ...(p.topics ?? []),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(search);
  });
}

export function difficultyClass(difficulty: Difficulty): string {
  switch (difficulty) {
    case "Easy":
      return "text-emerald-400 bg-emerald-950/40 border-emerald-900/40";
    case "Medium":
      return "text-amber-400 bg-amber-950/40 border-amber-900/40";
    case "Hard":
      return "text-rose-400 bg-rose-950/40 border-rose-900/40";
  }
}
