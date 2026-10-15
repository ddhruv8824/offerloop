export interface TestCase {
  input: string;
  expected_output: string;
  label?: string | null;
  hidden: boolean;
}

export interface FunctionTestCase {
  args: Record<string, any>;
  expected: any;
  label?: string | null;
  hidden: boolean;
}

export interface TestResult {
  label?: string | null;
  passed: boolean;
  hidden: boolean;
  input?: string | null;
  expected_output?: string | null;
  actual_output?: string | null;
  stderr?: string | null;
  status: string;
}

export interface RunRequest {
  source_code: string;
  language: string;
  test_cases?: TestCase[];
  function_test_cases?: FunctionTestCase[];
  entry_point?: string;
  evaluation_mode?: 'stdin' | 'function';
}

export interface RunResponse {
  all_passed: boolean;
  passed_count: number;
  total_count: number;
  results: TestResult[];
}
