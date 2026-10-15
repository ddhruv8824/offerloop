import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { TestCase, FunctionTestCase, TestResult } from '../types/codeTypes';
import { LOCAL_TIMEOUT_SEC, LANGUAGE_IDS, JUDGE0_URL } from '../config/appConfig';

function getPythonExecutable(): string {
  const winVenv = path.join(process.cwd(), 'venv', 'Scripts', 'python.exe');
  const unixVenv = path.join(process.cwd(), 'venv', 'bin', 'python');

  if (fs.existsSync(winVenv)) {
    return winVenv;
  }
  if (fs.existsSync(unixVenv)) {
    return unixVenv;
  }
  return 'python';
}

export function runLocal(
  sourceCode: string,
  language: string,
  stdin: string,
  timeoutSec: number = LOCAL_TIMEOUT_SEC
): Promise<{ stdout: string; stderr: string; status: string }> {
  return new Promise((resolve) => {
    let executable = '';
    let args: string[] = [];

    const lang = language.toLowerCase();
    if (lang === 'python') {
      executable = getPythonExecutable();
      args = ['-c', sourceCode];
    } else if (lang === 'javascript') {
      executable = process.execPath;
      args = ['-e', sourceCode];
    } else {
      resolve({
        stdout: '',
        stderr: `Language '${language}' is not supported in local mode.`,
        status: 'Runtime Error',
      });
      return;
    }

    const child = spawn(executable, args, {
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let isTimedOut = false;

    const timer = setTimeout(() => {
      isTimedOut = true;
      child.kill('SIGKILL');
    }, timeoutSec * 1000);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    if (stdin && child.stdin) {
      child.stdin.write(stdin);
      child.stdin.end();
    } else if (child.stdin) {
      child.stdin.end();
    }

    child.on('close', (code) => {
      clearTimeout(timer);
      if (isTimedOut) {
        resolve({
          stdout: '',
          stderr: `Execution timed out (${timeoutSec}s limit)`,
          status: 'Time Limit Exceeded',
        });
      } else if (code !== 0) {
        const detail = stderr.trim() || `Process exited with code ${code}`;
        resolve({
          stdout,
          stderr: detail,
          status: 'Runtime Error',
        });
      } else {
        resolve({
          stdout,
          stderr: stderr.trim(),
          status: 'Accepted',
        });
      }
    });

    child.on('error', (err: any) => {
      clearTimeout(timer);
      let errMsg = err.message;
      if (err.code === 'ENOENT') {
        if (lang === 'python') {
          errMsg = "Python interpreter was not found. Please install Python or verify your setup.";
        } else if (lang === 'javascript') {
          errMsg = "Node.js environment not found.";
        }
      }
      resolve({
        stdout: '',
        stderr: errMsg,
        status: 'Runtime Error',
      });
    });
  });
}

function normalizePythonSource(sourceCode: string): string {
  const lines = sourceCode.split(/\r?\n/);
  if (lines.length === 0 || (lines.length === 1 && !lines[0])) {
    return 'pass';
  }

  const blockPrefixes = ['def ', 'async def ', 'class '];
  const result: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    result.push(line);
    const stripped = line.trimEnd();
    if (!stripped.endsWith(':')) {
      i++;
      continue;
    }

    const isBlock = blockPrefixes.some(prefix => stripped.trimStart().startsWith(prefix));
    if (!isBlock) {
      i++;
      continue;
    }

    const baseIndent = line.length - line.trimStart().length;
    const bodyIndent = baseIndent + 4;
    let j = i + 1;
    let hasStatement = false;
    while (j < lines.length) {
      const nxt = lines[j];
      if (!nxt.trim()) {
        j++;
        continue;
      }
      const nxtIndent = nxt.length - nxt.trimStart().length;
      if (nxtIndent <= baseIndent) {
        break;
      }
      if (nxtIndent >= bodyIndent && nxt.trim() && !nxt.trim().startsWith('#')) {
        hasStatement = true;
        break;
      }
      j++;
    }

    if (!hasStatement) {
      result.push(' '.repeat(bodyIndent) + 'pass');
    }
    i++;
  }

  return result.join('\n');
}

function buildPythonFunctionHarness(
  sourceCode: string,
  entryPoint: string,
  testCases: FunctionTestCase[]
): string {
  const normalizedSource = normalizePythonSource(sourceCode);
  const payload = JSON.stringify(
    testCases.map(tc => ({
      args: tc.args,
      expected: tc.expected,
      label: tc.label,
      hidden: tc.hidden,
    }))
  );
  return `import json
import sys
from io import StringIO
from typing import List, Optional, Dict, Set, Tuple, Any

_user_ns = {
    "List": List,
    "Optional": Optional,
    "Dict": Dict,
    "Set": Set,
    "Tuple": Tuple,
    "Any": Any,
}

_init_stdout = StringIO()
_orig_stdout = sys.stdout
sys.stdout = _init_stdout

try:
    exec(${JSON.stringify(normalizedSource)}, _user_ns)
finally:
    sys.stdout = _orig_stdout

_init_output = _init_stdout.getvalue()

Solution = _user_ns.get("Solution")
if Solution is None:
    raise RuntimeError("Solution class not found in submitted code")
_test_cases = json.loads(${JSON.stringify(payload)})
_sol = Solution()
_method = getattr(_sol, ${JSON.stringify(entryPoint)}, None)
if _method is None:
    raise RuntimeError("Method ${entryPoint} not found on Solution")

_results = []
for _i, _tc in enumerate(_test_cases):
    _label = _tc.get("label") or f"Test {_i + 1}"
    _hidden = bool(_tc.get("hidden"))
    
    _stdout_capture = StringIO()
    sys.stdout = _stdout_capture
    _actual = None
    _exc = None
    
    try:
        _actual = _method(**_tc["args"])
        _expected = _tc["expected"]
        _passed = _actual == _expected
    except Exception as _e:
        _exc = _e
        _passed = False
    finally:
        sys.stdout = _orig_stdout
        
    _case_stdout = _stdout_capture.getvalue()
    
    _captured_stderr = []
    if _i == 0 and _init_output:
        _captured_stderr.append(_init_output)
    if _case_stdout:
        _captured_stderr.append(_case_stdout)
    if _exc:
        _captured_stderr.append(str(_exc))
        
    _stderr_str = "\\n".join(_captured_stderr) if _captured_stderr else None
    
    if _exc is None:
        _results.append({
            "label": _label,
            "passed": _passed,
            "hidden": _hidden,
            "input": None if _hidden else json.dumps(_tc["args"]),
            "expected_output": None if _hidden else json.dumps(_expected),
            "actual_output": None if _hidden else json.dumps(_actual),
            "stderr": _stderr_str,
            "status": "Accepted" if _passed else "Wrong Answer",
        })
    else:
        _results.append({
            "label": _label,
            "passed": False,
            "hidden": _hidden,
            "input": None if _hidden else json.dumps(_tc["args"]),
            "expected_output": None if _hidden else json.dumps(_tc["expected"]),
            "actual_output": None,
            "stderr": _stderr_str,
            "status": "Runtime Error",
        })

print("__HARNESS_RESULTS_START__" + json.dumps(_results) + "__HARNESS_RESULTS_END__")
`;
}

function buildJavascriptFunctionHarness(
  sourceCode: string,
  entryPoint: string,
  testCases: FunctionTestCase[]
): string {
  const payload = JSON.stringify(
    testCases.map(tc => ({
      args: tc.args,
      expected: tc.expected,
      label: tc.label,
      hidden: tc.hidden,
    }))
  );
  return `
const _origConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug
};
let _capturedOutput = [];
const _log = (...args) => {
  _capturedOutput.push(args.map(a => {
    if (a === null) return "null";
    if (a === undefined) return "undefined";
    if (typeof a === 'object') {
      try { return JSON.stringify(a); } catch(e) { return String(a); }
    }
    return String(a);
  }).join(' '));
};
console.log = _log;
console.error = _log;
console.warn = _log;
console.info = _log;
console.debug = _log;

${sourceCode}

const _testCases = JSON.parse(${JSON.stringify(payload)});
const _results = [];
let _caller;

let _initOutput = _capturedOutput.join('\\n');
_capturedOutput = [];

if (typeof Solution !== "undefined") {
  const _instance = new Solution();
  const _method = _instance[${JSON.stringify(entryPoint)}];
  if (typeof _method !== "function") {
    throw new Error("Method ${entryPoint} not found on Solution");
  }
  _caller = (args) => _method.apply(_instance, Object.values(args));
} else if (typeof ${entryPoint} === "function") {
  _caller = (args) => ${entryPoint}(...Object.values(args));
} else {
  throw new Error("Could not find function ${entryPoint}");
}

for (let _i = 0; _i < _testCases.length; _i++) {
  const _tc = _testCases[_i];
  const _label = _tc.label || \`Test \${_i + 1}\`;
  const _hidden = Boolean(_tc.hidden);
  _capturedOutput = [];
  try {
    const _actual = _caller(_tc.args);
    const _expected = _tc.expected;
    const _passed = JSON.stringify(_actual) === JSON.stringify(_expected);
    
    let _stderrParts = [];
    if (_i === 0 && _initOutput) {
      _stderrParts.push(_initOutput);
    }
    if (_capturedOutput.length > 0) {
      _stderrParts.push(_capturedOutput.join('\\n'));
    }
    const _stderr = _stderrParts.length > 0 ? _stderrParts.join('\\n') : null;

    _results.push({
      label: _label,
      passed: _passed,
      hidden: _hidden,
      input: _hidden ? null : JSON.stringify(_tc.args),
      expected_output: _hidden ? null : JSON.stringify(_expected),
      actual_output: _hidden ? null : JSON.stringify(_actual),
      stderr: _stderr,
      status: _passed ? "Accepted" : "Wrong Answer",
    });
  } catch (_err) {
    let _stderrParts = [];
    if (_i === 0 && _initOutput) {
      _stderrParts.push(_initOutput);
    }
    if (_capturedOutput.length > 0) {
      _stderrParts.push(_capturedOutput.join('\\n'));
    }
    _stderrParts.push(String(_err && _err.stack ? _err.stack : _err));
    const _stderr = _stderrParts.join('\\n');

    _results.push({
      label: _label,
      passed: false,
      hidden: _hidden,
      input: _hidden ? null : JSON.stringify(_tc.args),
      expected_output: _hidden ? null : JSON.stringify(_tc.expected),
      actual_output: null,
      stderr: _stderr,
      status: "Runtime Error",
    });
  }
}

console.log = _origConsole.log;
console.error = _origConsole.error;
console.warn = _origConsole.warn;
console.info = _origConsole.info;
console.debug = _origConsole.debug;

console.log("__HARNESS_RESULTS_START__" + JSON.stringify(_results) + "__HARNESS_RESULTS_END__");
`;
}

export async function runFunctionLocal(
  sourceCode: string,
  language: string,
  entryPoint: string,
  testCases: FunctionTestCase[],
  timeoutSec: number = LOCAL_TIMEOUT_SEC
): Promise<TestResult[]> {
  if (!entryPoint) {
    throw new Error('entry_point is required for function evaluation');
  }

  const lang = language.toLowerCase();
  let harness = '';
  if (lang === 'python') {
    harness = buildPythonFunctionHarness(sourceCode, entryPoint, testCases);
  } else if (lang === 'javascript') {
    harness = buildJavascriptFunctionHarness(sourceCode, entryPoint, testCases);
  } else {
    throw new Error(`Function evaluation not supported for language '${language}'`);
  }

  const { stdout, stderr, status } = await runLocal(harness, lang, '', timeoutSec);

  if (status === 'Time Limit Exceeded') {
    throw new Error(`Execution timed out (${timeoutSec}s limit)`);
  }

  if (status === 'Runtime Error') {
    throw new Error(stderr || 'Process exited with error');
  }

  try {
    const startMarker = '__HARNESS_RESULTS_START__';
    const endMarker = '__HARNESS_RESULTS_END__';
    const startIndex = stdout.lastIndexOf(startMarker);
    const endIndex = stdout.lastIndexOf(endMarker);
    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
      throw new Error(`Could not find harness results marker in output. Raw output: ${stdout.slice(0, 300)}`);
    }
    const jsonStr = stdout.substring(startIndex + startMarker.length, endIndex);
    const rawResults = JSON.parse(jsonStr.trim());
    return rawResults as TestResult[];
  } catch (exc: any) {
    throw new Error(`Failed to parse harness output: ${stdout.slice(0, 300)} (${exc.message})`);
  }
}

export async function submitToJudge0(
  sourceCode: string,
  languageId: number,
  stdin: string,
  judge0Url: string = JUDGE0_URL
): Promise<any> {
  const url = `${judge0Url}/submissions?base64_encoded=false&wait=false`;
  let resp;
  try {
    resp = await axios.post(
      url,
      {
        source_code: sourceCode,
        language_id: languageId,
        stdin: stdin,
      },
      { timeout: 30000 }
    );
  } catch (err: any) {
    throw new Error(`Judge0 submission failed: ${err.message}. Is Judge0 running at ${judge0Url}?`);
  }

  if (resp.status !== 200 && resp.status !== 201) {
    throw new Error(`Judge0 submission failed (${resp.status}): ${JSON.stringify(resp.data).slice(0, 300)}`);
  }

  const token = resp.data.token;

  for (let i = 0; i < 30; i++) {
    const pollUrl = `${judge0Url}/submissions/${token}?base64_encoded=false`;
    let pollResp;
    try {
      pollResp = await axios.get(pollUrl, { timeout: 30000 });
    } catch (err: any) {
      throw new Error(`Judge0 status poll failed: ${err.message}`);
    }

    const data = pollResp.data;
    if (data.status && data.status.id > 2) {
      return data;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new Error('Judge0 execution timed out');
}

function normalizeStr(s: string | null | undefined): string {
  return (s || '').trim();
}

export function resultFromJudge0(data: any, tc: TestCase): TestResult {
  const statusDesc = data.status?.description || 'Unknown';
  const actual = data.stdout;
  const stderr = data.stderr || data.compile_output;
  const passed = statusDesc === 'Accepted' && normalizeStr(actual) === normalizeStr(tc.expected_output);
  return {
    label: tc.label || null,
    passed,
    hidden: tc.hidden,
    input: tc.hidden ? null : tc.input,
    expected_output: tc.hidden ? null : tc.expected_output,
    actual_output: tc.hidden ? null : actual,
    stderr: stderr || null,
    status: statusDesc,
  };
}

export function resultFromLocal(
  actual: string | null,
  stderr: string | null,
  status: string,
  tc: TestCase
): TestResult {
  const passed = status === 'Accepted' && normalizeStr(actual) === normalizeStr(tc.expected_output);
  let finalStatus = status;
  if (status === 'Accepted' && !passed) {
    finalStatus = 'Wrong Answer';
  }
  return {
    label: tc.label || null,
    passed,
    hidden: tc.hidden,
    input: tc.hidden ? null : tc.input,
    expected_output: tc.hidden ? null : tc.expected_output,
    actual_output: tc.hidden ? null : actual,
    stderr: stderr || null,
    status: finalStatus,
  };
}
