export interface TestCase {
  input: string;
  expected_output: string;
  label?: string;
  hidden?: boolean;
}

/** Function-style tests from Bro Code repo: args + expected return value */
export interface FunctionTestCase {
  args: Record<string, unknown>;
  expected: unknown;
  label?: string;
  hidden?: boolean;
}

export interface BroCodeExample {
  example_num: number;
  example_text: string;
  images: string[];
}

export interface Problem {
  id: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  description: string;
  starterCode: Record<string, string>;
  testCases: TestCase[];
  functionTestCases?: FunctionTestCase[];
  entryPoint?: string;
  evaluationMode?: "stdin" | "function";
  topics?: string[];
  examples?: BroCodeExample[];
  constraints?: string[];
  hints?: string[];
  frontendId?: string;
  source?: "brocode" | "custom";
}

export interface TestResult {
  label?: string;
  passed: boolean;
  hidden: boolean;
  input?: string;
  expected_output?: string;
  actual_output?: string;
  stderr?: string;
  status: string;
}

export interface RunResponse {
  all_passed: boolean;
  passed_count: number;
  total_count: number;
  results: TestResult[];
}

export const INITIAL_PROBLEMS: Problem[] = [];
