import { Request, Response } from 'express';
import { CODE_EXECUTOR, JUDGE0_URL, LOCAL_LANGUAGES, LANGUAGE_IDS } from '../config/appConfig';
import * as executorService from '../services/executorService';
import * as problemService from '../services/problemService';
import { TestResult } from '../types/codeTypes';

export const getHealth = (req: Request, res: Response) => {
  return res.json({
    status: 'ok',
    executor: CODE_EXECUTOR,
    local_languages: LOCAL_LANGUAGES.sort(),
    judge0_url: CODE_EXECUTOR === 'judge0' ? JUDGE0_URL : null,
  });
};

export const runCode = async (req: Request, res: Response) => {
  try {
    const {
      source_code,
      language,
      test_cases = [],
      function_test_cases = [],
      entry_point,
      evaluation_mode = 'stdin',
    } = req.body;

    if (!source_code || !language) {
      return res.status(400).json({ detail: 'source_code and language are required' });
    }

    const lang = language.toLowerCase();
    let results: TestResult[] = [];

    if (evaluation_mode === 'function') {
      if (CODE_EXECUTOR === 'judge0') {
        return res.status(400).json({ detail: 'Function evaluation is only supported with the local executor.' });
      }
      if (!function_test_cases || function_test_cases.length === 0) {
        return res.status(400).json({ detail: 'No function test cases provided' });
      }
      results = await executorService.runFunctionLocal(
        source_code,
        lang,
        entry_point || '',
        function_test_cases
      );
    } else if (CODE_EXECUTOR === 'judge0') {
      const languageId = LANGUAGE_IDS[lang];
      if (!languageId) {
        return res.status(400).json({ detail: `Unsupported language '${language}'. Supported: ${Object.keys(LANGUAGE_IDS)}` });
      }
      if (!test_cases || test_cases.length === 0) {
        return res.status(400).json({ detail: 'No test cases provided' });
      }
      for (const tc of test_cases) {
        const data = await executorService.submitToJudge0(source_code, languageId, tc.input);
        results.push(executorService.resultFromJudge0(data, tc));
      }
    } else {
      if (!LOCAL_LANGUAGES.includes(lang)) {
        return res.status(400).json({ detail: `Language '${language}' is not supported in local mode. Supported: ${LOCAL_LANGUAGES}` });
      }
      if (!test_cases || test_cases.length === 0) {
        return res.status(400).json({ detail: 'No test cases provided' });
      }
      for (const tc of test_cases) {
        const { stdout, stderr, status } = await executorService.runLocal(source_code, lang, tc.input);
        results.push(executorService.resultFromLocal(stdout, stderr, status, tc));
      }
    }

    const passedCount = results.filter(r => r.passed).length;
    return res.json({
      all_passed: passedCount === results.length,
      passed_count: passedCount,
      total_count: results.length,
      results,
    });
  } catch (err: any) {
    console.error(err);
    return res.status(400).json({ detail: err.message || 'An unexpected error occurred' });
  }
};

export const getProblems = async (req: Request, res: Response) => {
  try {
    const problems = await problemService.getMergedProblems();
    return res.json(problems);
  } catch (err: any) {
    console.error('Error proxying merged_problems.json:', err.message);
    const cached = problemService.getCachedMergedProblems();
    if (cached) {
      return res.json(cached);
    }
    return res.status(502).json({ detail: `Failed to fetch problems from GitHub: ${err.message}` });
  }
};

export const getProblemDetail = async (req: Request, res: Response) => {
  const fileSlug = req.params.fileSlug as string;
  try {
    const detail = await problemService.getProblemDetail(fileSlug);
    return res.json(detail);
  } catch (err: any) {
    console.error(`Error proxying problem ${fileSlug}:`, err.message);
    const cached = problemService.getCachedProblemDetail(fileSlug);
    if (cached) {
      return res.json(cached);
    }
    return res.status(502).json({ detail: `Failed to fetch problem ${fileSlug} from GitHub: ${err.message}` });
  }
};
