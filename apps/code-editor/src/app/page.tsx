"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, X, Code } from "lucide-react";
import { Problem, TestCase, RunResponse } from "./codingProblems";
import {
  BroCodeProblemSummary,
  Difficulty,
  broCodeDetailToProblem,
  detectCodeLanguageMismatch,
  extractEntryPointFromSource,
  fetchAllProblems,
  fetchProblemByFileSlug,
  filterProblems,
  getProblemFileSlug,
  getProblemStats,
} from "../lib/broCodeProblems";
import { EditorShell } from "../components/editor/EditorShell";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001/api/v1/code";

export default function Home() {
  const [summaries, setSummaries] = useState<BroCodeProblemSummary[]>([]);
  const [loadedProblems, setLoadedProblems] = useState<Record<string, Problem>>({});
  const [customProblems, setCustomProblems] = useState<Problem[]>([]);
  const [selectedProblemId, setSelectedProblemId] = useState<string>("");
  const [language, setLanguage] = useState<string>("python");
  const [searchQuery, setSearchQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<Difficulty | "All">("All");
  const [topicFilter, setTopicFilter] = useState<string>("All");
  const [problemsLoading, setProblemsLoading] = useState(true);
  const [problemsError, setProblemsError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  const activeProblem = useMemo(() => {
    const custom = customProblems.find((p) => p.id === selectedProblemId);
    if (custom) return custom;
    return loadedProblems[selectedProblemId] ?? null;
  }, [selectedProblemId, customProblems, loadedProblems]);

  const activeSummary = useMemo(
    () => summaries.find((s) => getProblemFileSlug(s) === selectedProblemId),
    [summaries, selectedProblemId]
  );

  const stats = useMemo(() => getProblemStats(summaries), [summaries]);

  const sidebarItems = useMemo(() => {
    const filtered = filterProblems(summaries, {
      search: searchQuery,
      difficulty: difficultyFilter,
      topic: topicFilter,
    });
    return [...filtered].sort(
      (a, b) => Number(a.frontend_id) - Number(b.frontend_id)
    );
  }, [summaries, searchQuery, difficultyFilter, topicFilter]);

  const filteredCustomProblems = useMemo(
    () =>
      customProblems.filter(
        (p) =>
          p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.description.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [customProblems, searchQuery]
  );
  const [code, setCode] = useState("");
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResponse | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"results" | "details">("results");
  const [selectedTestIndex, setSelectedTestIndex] = useState<number>(0);
  const [completedProblems, setCompletedProblems] = useState<Record<string, boolean>>({});
  const [showProblemList, setShowProblemList] = useState(false);
  const [descTab, setDescTab] = useState<"description" | "solution" | "submission">("description");
  const [bottomTab, setBottomTab] = useState<"testcase" | "result">("testcase");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerPaused, setTimerPaused] = useState(false);
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);

  // Custom Challenge Modal State
  const [showModal, setShowModal] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customDiff, setCustomDiff] = useState<"Easy" | "Medium" | "Hard">("Easy");
  const [customDesc, setCustomDesc] = useState("");
  const [customPyCode, setCustomPyCode] = useState("");
  const [customJsCode, setCustomJsCode] = useState("");
  const [customTestCases, setCustomTestCases] = useState<TestCase[]>([
    { input: "", expected_output: "", label: "Example 1", hidden: false }
  ]);

  useEffect(() => {
    if (timerPaused) return;
    const id = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [timerPaused]);

  const setCursorPos = useCallback((line: number, col: number) => {
    setCursorLine(line);
    setCursorCol(col);
  }, []);

  const applyStarterTemplate = useCallback(
    (lang: string, problem: Problem | null = activeProblem) => {
      if (!problem) return;
      setCode(problem.starterCode[lang] || "");
      setRunResult(null);
      setExecutionError(null);
      setShowHints(false);
    },
    [activeProblem]
  );

  const handleLanguageChange = useCallback(
    (lang: string) => {
      setLanguage(lang);
      applyStarterTemplate(lang);
    },
    [applyStarterTemplate]
  );
  useEffect(() => {
    let cancelled = false;

    async function loadBank() {
      setProblemsLoading(true);
      setProblemsError(null);
      try {
        const data = await fetchAllProblems();
        if (cancelled) return;
        setSummaries(data);
        if (data.length > 0) {
          setSelectedProblemId(getProblemFileSlug(data[0]));
        }
      } catch (err) {
        if (!cancelled) {
          setProblemsError(
            err instanceof Error ? err.message : "Failed to load questions"
          );
        }
      } finally {
        if (!cancelled) setProblemsLoading(false);
      }
    }

    loadBank();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch full problem detail when selection changes
  useEffect(() => {
    if (!selectedProblemId || selectedProblemId.startsWith("custom_")) return;
    if (loadedProblems[selectedProblemId]) return;

    let cancelled = false;

    async function loadDetail() {
      setDetailLoading(true);
      try {
        const detail = await fetchProblemByFileSlug(selectedProblemId);
        if (cancelled || !detail) return;
        setLoadedProblems((prev) => ({
          ...prev,
          [selectedProblemId]: broCodeDetailToProblem(detail),
        }));
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }

    loadDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedProblemId, loadedProblems]);

  // Load starter code when the selected problem changes
  useEffect(() => {
    if (activeProblem) {
      applyStarterTemplate(language, activeProblem);
    }
  }, [selectedProblemId, activeProblem?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check backend server status on mount and poll
  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/health`, { method: "GET" });
      if (res.ok) {
        setBackendOnline(true);
      } else {
        setBackendOnline(false);
      }
    } catch {
      setBackendOnline(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 8000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  // Run the code against the backend
  const handleRun = async () => {
    if (!activeProblem) return;

    const mismatch = detectCodeLanguageMismatch(code, language);
    if (mismatch) {
      setExecutionError(mismatch);
      setBottomTab("result");
      return;
    }

    const hasFunctionTests =
      (activeProblem.functionTestCases?.length ?? 0) > 0 &&
      activeProblem.evaluationMode === "function";
    const hasStdinTests = activeProblem.testCases.length > 0;

    if (!hasFunctionTests && !hasStdinTests) {
      setExecutionError(
        "This Bro Code question has no automated test cases yet. Write and refine your solution in the editor."
      );
      setBottomTab("result");
      return;
    }

    const entryPoint =
      (hasFunctionTests
        ? extractEntryPointFromSource(code, language) ??
          activeProblem.entryPoint
        : undefined) ?? undefined;

    if (hasFunctionTests && !entryPoint) {
      setExecutionError(
        "Could not detect the solution method name for this problem."
      );
      return;
    }

    setRunning(true);
    setExecutionError(null);
    setRunResult(null);
    setActiveTab("results");
    setBottomTab("result");

    try {
      const payload = hasFunctionTests
        ? {
            source_code: code,
            language: language,
            evaluation_mode: "function",
            entry_point: entryPoint,
            function_test_cases: activeProblem.functionTestCases,
            test_cases: [],
          }
        : {
            source_code: code,
            language: language,
            evaluation_mode: "stdin",
            test_cases: activeProblem.testCases,
            function_test_cases: [],
          };

      const res = await fetch(`${BACKEND_URL}/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorText = await res.text();
        let message = errorText || `Execution failed with status ${res.status}`;
        try {
          const parsed = JSON.parse(errorText);
          if (typeof parsed.detail === "string") {
            message = parsed.detail;
          }
        } catch {
          // keep raw text
        }
        throw new Error(message);
      }

      const data: RunResponse = await res.json();
      setRunResult(data);
      if (data.all_passed) {
        setCompletedProblems(prev => ({ ...prev, [activeProblem.id]: true }));
      }
    } catch (err: any) {
      console.error(err);
      setExecutionError(err.message || "Failed to execute code. Is the local backend runner running?");
      setBackendOnline(false);
    } finally {
      setRunning(false);
    }
  };

  // Reset starter code
  const handleReset = () => {
    if (activeProblem && window.confirm("Are you sure you want to reset your editor to the default template?")) {
      setCode(activeProblem.starterCode[language] || "");
      setRunResult(null);
      setExecutionError(null);
    }
  };

  // Custom Test Case Helpers
  const addTestCaseField = () => {
    setCustomTestCases(prev => [
      ...prev,
      { input: "", expected_output: "", label: `Example ${prev.length + 1}`, hidden: false }
    ]);
  };

  const removeTestCaseField = (idx: number) => {
    if (customTestCases.length <= 1) return;
    setCustomTestCases(prev => prev.filter((_, i) => i !== idx));
  };

  const updateTestCaseField = (idx: number, field: keyof TestCase, val: any) => {
    setCustomTestCases(prev => prev.map((tc, i) => {
      if (i === idx) {
        return { ...tc, [field]: val };
      }
      return tc;
    }));
  };

  // Save new custom problem
  const handleSaveProblem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle || !customDesc) {
      alert("Please enter a title and description");
      return;
    }

    const validTestCases = customTestCases.filter(tc => tc.input.trim() !== "" || tc.expected_output.trim() !== "");
    if (validTestCases.length === 0) {
      alert("Please provide at least one valid test case");
      return;
    }

    const newId = `custom_${Date.now()}`;
    const newProblem: Problem = {
      id: newId,
      title: customTitle,
      difficulty: customDiff,
      description: customDesc,
      starterCode: {
        python: customPyCode.trim() || "# Write python code here\n",
        javascript: customJsCode.trim() || "// Write javascript code here\n",
      },
      testCases: validTestCases,
      source: "custom",
    };

    setCustomProblems((prev) => [...prev, newProblem]);
    setSelectedProblemId(newId);
    setShowModal(false);

    // Reset Form
    setCustomTitle("");
    setCustomDiff("Easy");
    setCustomDesc("");
    setCustomPyCode("");
    setCustomJsCode("");
    setCustomTestCases([{ input: "", expected_output: "", label: "Example 1", hidden: false }]);
  };

  return (
    <>
      <EditorShell
        summaries={summaries}
        sidebarItems={sidebarItems}
        filteredCustomProblems={filteredCustomProblems}
        selectedProblemId={selectedProblemId}
        setSelectedProblemId={setSelectedProblemId}
        completedProblems={completedProblems}
        problemsLoading={problemsLoading}
        problemsError={problemsError}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        difficultyFilter={difficultyFilter}
        setDifficultyFilter={setDifficultyFilter}
        topicFilter={topicFilter}
        setTopicFilter={setTopicFilter}
        statsTopics={stats.topics}
        activeProblem={activeProblem}
        activeSummary={activeSummary}
        detailLoading={detailLoading}
        showHints={showHints}
        setShowHints={setShowHints}
        code={code}
        setCode={setCode}
        language={language}
        setLanguage={handleLanguageChange}
        running={running}
        handleRun={handleRun}
        handleReset={handleReset}
        runResult={runResult}
        executionError={executionError}
        selectedTestIndex={selectedTestIndex}
        setSelectedTestIndex={setSelectedTestIndex}
        showProblemList={showProblemList}
        setShowProblemList={setShowProblemList}
        descTab={descTab}
        setDescTab={setDescTab}
        bottomTab={bottomTab}
        setBottomTab={setBottomTab}
        elapsedSeconds={elapsedSeconds}
        timerPaused={timerPaused}
        setTimerPaused={setTimerPaused}
        cursorLine={cursorLine}
        cursorCol={cursorCol}
        setCursorPos={setCursorPos}
        showModal={showModal}
        setShowModal={setShowModal}
      />

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-stride-border bg-stride-surface p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-stride-border pb-4">
              <div className="flex items-center gap-2.5">
                <Code className="h-5 w-5 text-stride-purple" />
                <h3 className="text-base font-semibold text-white">Create Custom Challenge</h3>
              </div>
              <button 
                onClick={() => setShowModal(false)}
                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveProblem} className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-1">
                  <label className="block text-zinc-400 font-bold">Challenge Title</label>
                  <input
                    type="text"
                    required
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="e.g. Add Two Numbers"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-zinc-400 font-bold">Difficulty</label>
                  <select
                    value={customDiff}
                    onChange={(e: any) => setCustomDiff(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-zinc-400 font-bold">Problem Description</label>
                <textarea
                  required
                  rows={4}
                  value={customDesc}
                  onChange={(e) => setCustomDesc(e.target.value)}
                  placeholder="Provide problem specifications, constraints, and instructions. Read inputs from stdin..."
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 placeholder-zinc-650 focus:outline-none focus:border-indigo-500 font-sans"
                />
              </div>

              {/* Starter Templates code */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-zinc-400 font-bold">Python Starter Template</label>
                  <textarea
                    rows={4}
                    value={customPyCode}
                    onChange={(e) => setCustomPyCode(e.target.value)}
                    placeholder="# Read stdin and print results..."
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-300 placeholder-zinc-650 focus:outline-none focus:border-indigo-500 font-mono text-[11px]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-zinc-400 font-bold">JavaScript Starter Template</label>
                  <textarea
                    rows={4}
                    value={customJsCode}
                    onChange={(e) => setCustomJsCode(e.target.value)}
                    placeholder="const fs = require('fs');..."
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-300 placeholder-zinc-650 focus:outline-none focus:border-indigo-500 font-mono text-[11px]"
                  />
                </div>
              </div>

              {/* Test Cases configuration */}
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-1">
                  <span className="block text-zinc-400 font-bold">Test Cases (Minimum 1 Required)</span>
                  <button
                    type="button"
                    onClick={addTestCaseField}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="h-3 w-3" /> Add Case
                  </button>
                </div>

                <div className="space-y-3 max-h-[180px] overflow-y-auto pr-1">
                  {customTestCases.map((tc, idx) => (
                    <div key={idx} className="flex gap-3 items-start bg-zinc-950/60 p-3 rounded-lg border border-zinc-850">
                      <div className="flex-1 space-y-2">
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            type="text"
                            required
                            placeholder="Label (e.g. Case 1)"
                            value={tc.label}
                            onChange={(e) => updateTestCaseField(idx, "label", e.target.value)}
                            className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-200 focus:outline-none text-[11px]"
                          />
                          <div className="col-span-2 flex items-center gap-2 pl-2">
                            <input
                              type="checkbox"
                              id={`hidden-${idx}`}
                              checked={tc.hidden}
                              onChange={(e) => updateTestCaseField(idx, "hidden", e.target.checked)}
                              className="rounded border-zinc-800 bg-zinc-900 accent-indigo-600 focus:outline-none cursor-pointer"
                            />
                            <label htmlFor={`hidden-${idx}`} className="text-zinc-500 text-[10px] select-none cursor-pointer">
                              Hidden case (used in grading)
                            </label>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            required
                            placeholder="Input String"
                            value={tc.input}
                            onChange={(e) => updateTestCaseField(idx, "input", e.target.value)}
                            className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-200 focus:outline-none text-[11px] font-mono"
                          />
                          <input
                            type="text"
                            required
                            placeholder="Expected Output String"
                            value={tc.expected_output}
                            onChange={(e) => updateTestCaseField(idx, "expected_output", e.target.value)}
                            className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-200 focus:outline-none text-[11px] font-mono"
                          />
                        </div>
                      </div>
                      
                      {customTestCases.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeTestCaseField(idx)}
                          className="p-1 rounded bg-zinc-900 hover:bg-zinc-850 text-rose-400 border border-zinc-800 mt-0.5 cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Save Footer button */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg bg-zinc-800 hover:bg-zinc-700 px-4 py-2 font-semibold text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="lc-btn-purple"
                >
                  Save & Load Challenge
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

