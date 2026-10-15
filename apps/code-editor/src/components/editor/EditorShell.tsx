"use client";

import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import Editor, { loader } from "@monaco-editor/react";

loader.config({ paths: { vs: "/monaco-editor/min/vs" } });

import {
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  X,
  Loader2,
} from "lucide-react";
import type { Problem, RunResponse } from "../../app/codingProblems";
import type { BroCodeProblemSummary, Difficulty } from "../../lib/broCodeProblems";
import { getProblemFileSlug } from "../../lib/broCodeProblems";
import {
  descriptionParagraphs,
  difficultyBadgeClass,
  exampleBorderClass,
  formatElapsed,
  parseExampleText,
} from "../../lib/formatTestcase";

type DescTab = "description" | "solution" | "submission";

const DESC_TABS: {
  id: DescTab;
  label: string;
  icon: ReactElement;
}[] = [
  {
    id: "description",
    label: "Description",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: "solution",
    label: "Solution",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
  {
    id: "submission",
    label: "Submission",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
      </svg>
    ),
  },
];

export interface EditorShellProps {
  summaries: BroCodeProblemSummary[];
  sidebarItems: BroCodeProblemSummary[];
  filteredCustomProblems: Problem[];
  selectedProblemId: string;
  setSelectedProblemId: (id: string) => void;
  completedProblems: Record<string, boolean>;
  problemsLoading: boolean;
  problemsError: string | null;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  difficultyFilter: Difficulty | "All";
  setDifficultyFilter: (d: Difficulty | "All") => void;
  topicFilter: string;
  setTopicFilter: (t: string) => void;
  statsTopics: string[];
  activeProblem: Problem | null;
  activeSummary: BroCodeProblemSummary | undefined;
  detailLoading: boolean;
  showHints: boolean;
  setShowHints: (v: boolean | ((p: boolean) => boolean)) => void;
  code: string;
  setCode: (c: string) => void;
  language: string;
  setLanguage: (l: string) => void;
  running: boolean;
  handleRun: () => void;
  handleReset: () => void;
  runResult: RunResponse | null;
  executionError: string | null;
  selectedTestIndex: number;
  setSelectedTestIndex: (i: number) => void;
  showProblemList: boolean;
  setShowProblemList: (v: boolean) => void;
  descTab: DescTab;
  setDescTab: (t: DescTab) => void;
  bottomTab: "testcase" | "result";
  setBottomTab: (t: "testcase" | "result") => void;
  elapsedSeconds: number;
  timerPaused: boolean;
  setTimerPaused: (v: boolean) => void;
  cursorLine: number;
  cursorCol: number;
  setCursorPos: (line: number, col: number) => void;
  showModal: boolean;
  setShowModal: (v: boolean) => void;
}

export function EditorShell(props: EditorShellProps) {
  const {
    sidebarItems,
    filteredCustomProblems,
    selectedProblemId,
    setSelectedProblemId,
    completedProblems,
    problemsLoading,
    problemsError,
    searchQuery,
    setSearchQuery,
    difficultyFilter,
    setDifficultyFilter,
    topicFilter,
    setTopicFilter,
    statsTopics,
    activeProblem,
    activeSummary,
    detailLoading,
    showHints,
    setShowHints,
    code,
    setCode,
    language,
    setLanguage,
    running,
    handleRun,
    handleReset,
    runResult,
    executionError,
    selectedTestIndex,
    setSelectedTestIndex,
    showProblemList,
    setShowProblemList,
    descTab,
    setDescTab,
    bottomTab,
    setBottomTab,
    elapsedSeconds,
    timerPaused,
    setTimerPaused,
    cursorLine,
    cursorCol,
    setCursorPos,
    setShowModal,
  } = props;

  const title = activeProblem?.title ?? activeSummary?.title ?? "Select a problem";
  const difficulty = activeProblem?.difficulty ?? activeSummary?.difficulty;
  const topics = activeProblem?.topics ?? activeSummary?.topics ?? [];
  const rawDesc =
    activeProblem?.description || activeSummary?.description || "";
  const paragraphs = rawDesc ? descriptionParagraphs(rawDesc) : [];

  const testcaseRows = (() => {
    if (!activeProblem) return [];
    if (activeProblem.functionTestCases?.length) {
      return activeProblem.functionTestCases.map((tc, i) => ({
        label: `Testcase ${i + 1}`,
        text: Object.entries(tc.args)
          .map(([k, v]) => `${k} = ${JSON.stringify(v)}`)
          .join("\n"),
        hidden: tc.hidden,
      }));
    }
    return activeProblem.testCases.map((tc, i) => ({
      label: `Testcase ${i + 1}`,
      text: tc.input || "(empty)",
      hidden: tc.hidden,
    }));
  })();

  const hasTests =
    (activeProblem?.functionTestCases?.length ?? 0) > 0 ||
    (activeProblem?.testCases.length ?? 0) > 0;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-stride-bg font-sans text-stride-text">
      {/* ── Header (from code.html) ── */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-stride-border bg-stride-surface px-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-stride-gray">
            <button
              type="button"
              onClick={() => setShowProblemList(true)}
              className="rounded p-1.5 hover:bg-stride-panel"
              aria-label="Back"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M10 19l-7-7m0 0l7-7m-7 7h18" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setShowProblemList(!showProblemList)}
              className="rounded p-1.5 hover:bg-stride-panel"
              aria-label="Menu"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M4 6h16M4 12h16m-7 6h7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
              </svg>
            </button>
          </div>
          <div className="hidden min-w-[200px] items-center justify-center rounded-lg border border-stride-border bg-stride-bg px-3 py-1 text-sm text-stride-gray md:flex">
            <span className="mr-1 opacity-50">
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
            </span>
            bro-code
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Ask AI & Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex w-[220px] cursor-pointer items-center rounded-md border border-stride-border bg-stride-panel px-3 py-1.5 text-sm text-stride-gray transition-colors placeholder:text-stride-gray hover:bg-stride-border focus:cursor-text focus:text-white focus:outline-none lg:w-[280px]"
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-stride-border bg-stride-bg px-1 text-[10px] text-stride-gray">
              Ctrl + K
            </span>
          </div>

          <div className="flex items-center gap-2 border-l border-stride-border pl-4">
            <button
              type="button"
              onClick={handleRun}
              disabled={running || detailLoading || !hasTests}
              className="flex items-center gap-2 rounded-md bg-stride-accent/20 px-4 py-1.5 text-sm font-medium text-stride-accent hover:bg-stride-accent/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
              </svg>
              Submit
            </button>

            <button
              type="button"
              onClick={() => setShowHints((v) => !v)}
              disabled={!activeProblem?.hints?.length}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-stride-gray hover:text-white disabled:opacity-40"
            >
              <svg className="h-4 w-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1a1 1 0 112 0v1a1 1 0 11-2 0zM13 16v-1a1 1 0 112 0v1a1 1 0 11-2 0zM14.243 14.243a1 1 0 10-1.414-1.414l-.707.707a1 1 0 101.414 1.414l.707-.707zM6.464 14.95a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 1.414l-.707.707z" />
              </svg>
              Hint
            </button>

            <button
              type="button"
              onClick={() => setTimerPaused(!timerPaused)}
              className="flex items-center gap-2 text-sm text-stride-gray hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
              </svg>
              {formatElapsed(elapsedSeconds)}
            </button>

            <LanguagePicker value={language} onChange={setLanguage} />

            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="p-1 hover:text-white"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>

            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-stride-border bg-stride-purple text-xs font-bold text-white">
              B
            </div>
          </div>
        </div>
      </header>

      {/* Problem list drawer */}
      {showProblemList && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60"
            onClick={() => setShowProblemList(false)}
          />
          <aside className="fixed left-0 top-0 z-50 flex h-full w-[300px] flex-col border-r border-stride-border bg-stride-surface">
            <div className="flex items-center justify-between border-b border-stride-border px-4 py-3">
              <span className="text-sm font-semibold text-white">Problems</span>
              <button type="button" onClick={() => setShowProblemList(false)}>
                <X className="h-4 w-4 text-stride-gray" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 border-b border-stride-border p-3">
              <select
                value={difficultyFilter}
                onChange={(e) =>
                  setDifficultyFilter(e.target.value as Difficulty | "All")
                }
                className="rounded border border-stride-border bg-stride-bg px-2 py-1.5 text-xs outline-none"
              >
                <option value="All">All</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
              <select
                value={topicFilter}
                onChange={(e) => setTopicFilter(e.target.value)}
                className="rounded border border-stride-border bg-stride-bg px-2 py-1.5 text-xs outline-none"
              >
                <option value="All">All topics</option>
                {statsTopics.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {problemsLoading && (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-stride-purple" />
                </div>
              )}
              {problemsError && (
                <p className="p-3 text-xs text-red-400">{problemsError}</p>
              )}
              {filteredCustomProblems.map((p) => (
                <ProblemListItem
                  key={p.id}
                  title={p.title}
                  difficulty={p.difficulty}
                  active={p.id === selectedProblemId}
                  done={completedProblems[p.id]}
                  onClick={() => {
                    setSelectedProblemId(p.id);
                    setShowProblemList(false);
                  }}
                />
              ))}
              {sidebarItems.map((p) => {
                const id = getProblemFileSlug(p);
                return (
                  <ProblemListItem
                    key={id}
                    title={`${p.frontend_id}. ${p.title}`}
                    difficulty={p.difficulty}
                    active={id === selectedProblemId}
                    done={completedProblems[id]}
                    onClick={() => {
                      setSelectedProblemId(id);
                      setShowProblemList(false);
                    }}
                  />
                );
              })}
            </div>
          </aside>
        </>
      )}

      {/* ── Main workspace ── */}
      <main className="flex flex-1 gap-2 overflow-hidden p-2">
        {/* Left: Problem pane */}
        <section className="flex w-1/2 min-w-[360px] flex-col overflow-hidden rounded-xl border border-stride-border bg-stride-panel">
          <div className="flex items-center gap-6 border-b border-stride-border bg-stride-surface px-4 py-2 text-xs font-medium">
            {DESC_TABS.map(({ id, label, icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setDescTab(id)}
                className={`flex items-center gap-1.5 pb-2 ${
                  descTab === id
                    ? "border-b-2 border-white text-white"
                    : "cursor-pointer text-stride-gray hover:text-white"
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto p-6">
            {detailLoading && !activeProblem && (
              <div className="flex items-center gap-2 text-sm text-stride-gray">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </div>
            )}

            {descTab === "description" && (
              <>
                <div className="flex items-start justify-between">
                  <h1 className="text-2xl font-bold text-white">{title}</h1>
                  <div className="flex items-center gap-2">
                    {topics.slice(0, 1).map((t) => (
                      <span
                        key={t}
                        className="rounded bg-stride-surface px-2 py-0.5 text-xs text-stride-gray"
                      >
                        {t}
                      </span>
                    ))}
                    {difficulty && (
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${difficultyBadgeClass(difficulty)}`}
                      >
                        {difficulty}
                      </span>
                    )}
                    <button type="button" className="text-stride-gray hover:text-white">
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                    </button>
                  </div>
                </div>

                <article className="space-y-4">
                  <h2 className="text-lg font-semibold text-white">Problem Description</h2>
                  {paragraphs.length > 0 ? (
                    paragraphs.map((p, i) => (
                      <p key={i} className="text-sm leading-relaxed text-stride-gray">
                        {p}
                      </p>
                    ))
                  ) : (
                    <p className="text-sm leading-relaxed text-stride-gray">
                      Open the menu (top-left) and pick a problem to get started.
                    </p>
                  )}
                </article>

                {activeProblem?.entryPoint && (
                  <div className="space-y-4 rounded-lg border border-stride-border bg-stride-surface/40 p-4">
                    <div>
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-white">
                        Input
                      </h3>
                      <p className="text-sm text-stride-gray">
                        Function{" "}
                        <code className="text-white">{activeProblem.entryPoint}</code>{" "}
                        with test case arguments.
                      </p>
                    </div>
                    <hr className="border-stride-border" />
                    <div>
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-white">
                        Output
                      </h3>
                      <p className="text-sm text-stride-gray">
                        Return value matching the expected result for each testcase.
                      </p>
                    </div>
                  </div>
                )}

                {activeProblem?.examples && activeProblem.examples.length > 0 && (
                  <div className="space-y-6">
                    {activeProblem.examples.map((ex, idx) => {
                      const parsed = parseExampleText(ex.example_text);
                      return (
                        <div key={ex.example_num}>
                          <h3 className="mb-2 text-sm font-semibold text-white">
                            Example {ex.example_num}
                          </h3>
                          <div
                            className={`rounded-md bg-stride-surface p-3 font-mono text-sm ${exampleBorderClass(idx)}`}
                          >
                            {parsed.input && (
                              <p>
                                <span className="text-stride-gray">Input:</span> {parsed.input}
                              </p>
                            )}
                            {parsed.output && (
                              <p>
                                <span className="text-stride-gray">Output:</span> {parsed.output}
                              </p>
                            )}
                            {parsed.explanation && (
                              <p>
                                <span className="text-stride-gray">Explanation:</span>{" "}
                                {parsed.explanation}
                              </p>
                            )}
                            {!parsed.input && !parsed.output && (
                              <p className="whitespace-pre-wrap text-stride-gray">
                                {ex.example_text}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {activeProblem?.constraints && activeProblem.constraints.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-white">Constraints</h3>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-stride-gray">
                      {activeProblem.constraints.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {showHints && activeProblem?.hints && (
                  <div className="rounded-lg border border-stride-border bg-stride-surface/40 p-4">
                    <h3 className="mb-3 text-sm font-semibold text-white">Hints</h3>
                    <ol className="list-decimal space-y-2 pl-5 text-sm text-stride-gray">
                      {activeProblem.hints.map((h, i) => (
                        <li key={i} dangerouslySetInnerHTML={{ __html: h }} />
                      ))}
                    </ol>
                  </div>
                )}
              </>
            )}

            {descTab === "solution" && (
              <p className="py-12 text-center text-sm text-stride-gray">
                Solutions are not available yet.
              </p>
            )}

            {descTab === "submission" && (
              <div className="py-4">
                {runResult ? (
                  <div
                    className={`rounded-lg border p-4 ${
                      runResult.all_passed
                        ? "border-stride-accent/50 bg-stride-accent/10"
                        : "border-red-500/50 bg-red-500/10"
                    }`}
                  >
                    <p className="text-base font-semibold text-white">
                      {runResult.all_passed ? "Accepted" : "Wrong Answer"}
                    </p>
                    <p className="mt-1 text-sm text-stride-gray">
                      {runResult.passed_count}/{runResult.total_count} passed
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-stride-gray">
                    Submit your code to see results here.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Right: Editor + Testcases */}
        <section className="flex w-1/2 min-w-0 flex-col gap-2">
          {/* Code editor */}
          <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-stride-border bg-stride-panel">
            <div className="flex items-center justify-between border-b border-stride-border bg-stride-surface px-4 py-2">
              <div className="flex items-center gap-2 text-xs font-medium text-white">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
                </svg>
                Code Editor
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(code)}
                  className="rounded p-1 hover:bg-stride-border"
                  title="Copy"
                >
                  <svg className="h-4 w-4 text-stride-gray" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex h-4 items-center gap-1 border-r border-stride-border px-2 text-xs text-stride-gray hover:text-white"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M4 6h16M4 12h16M4 18h7" />
                  </svg>
                  Format
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBottomTab("result");
                    handleRun();
                  }}
                  disabled={running || detailLoading}
                  className="flex items-center gap-1.5 rounded bg-stride-purple px-4 py-1 text-xs font-semibold text-white hover:bg-opacity-80 disabled:opacity-50"
                >
                  <Play className="h-3 w-3 fill-white text-white" />
                  Run
                </button>
                <button
                  type="button"
                  onClick={() => setBottomTab(bottomTab === "result" ? "testcase" : "result")}
                  className="p-1 text-stride-gray hover:text-white"
                  title="Toggle results"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="relative min-h-[180px] flex-1 bg-stride-panel">
              <Editor
                height="100%"
                language={language === "python" ? "python" : "javascript"}
                value={code}
                onChange={(val) => setCode(val || "")}
                onMount={(editor) => {
                  editor.onDidChangeCursorPosition((e) => {
                    setCursorPos(e.position.lineNumber, e.position.column);
                  });
                }}
                theme="vs-dark"
                options={{
                  fontSize: 13,
                  fontFamily: "var(--font-fira), Fira Code, monospace",
                  fontLigatures: true,
                  lineHeight: 22,
                  minimap: { enabled: false },
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                  padding: { top: 16, bottom: 16 },
                  scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
                  renderLineHighlight: "all",
                  lineNumbers: "on",
                  glyphMargin: false,
                  folding: false,
                }}
              />
            </div>

            <div className="flex h-8 items-center justify-between border-t border-stride-border bg-stride-surface px-3 text-[10px] text-stride-gray">
              <div className="flex items-center gap-4">
                <span className="flex cursor-pointer items-center gap-1 hover:text-white">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  History
                </span>
                <span>
                  Ln {cursorLine}, Col {cursorCol}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-blue-400" />
                {language === "python" ? "Python" : "JavaScript"}
              </div>
            </div>
          </div>

          {/* Testcase pane */}
          <div className="flex h-1/3 min-h-[160px] max-h-[280px] flex-col overflow-hidden rounded-xl border border-stride-border bg-stride-panel">
            <div className="flex items-center justify-between border-b border-stride-border bg-stride-surface px-4 py-2">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setBottomTab("testcase")}
                  className={`flex items-center gap-2 text-xs font-medium ${
                    bottomTab === "testcase" ? "text-white" : "text-stride-gray hover:text-white"
                  }`}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Testcase
                </button>
                <button
                  type="button"
                  onClick={() => setBottomTab("result")}
                  className={`text-xs font-medium ${
                    bottomTab === "result" ? "text-white" : "text-stride-gray hover:text-white"
                  }`}
                >
                  Results
                  {runResult && (
                    <span className="ml-1 opacity-70">
                      ({runResult.passed_count}/{runResult.total_count})
                    </span>
                  )}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button className="rounded p-1 text-stride-gray hover:bg-stride-border">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {bottomTab === "testcase" &&
                (testcaseRows.length === 0 ? (
                  <p className="text-sm text-stride-gray">No test cases yet.</p>
                ) : (
                  <div className="space-y-4">
                    {testcaseRows.map((row, i) => (
                      <div key={i}>
                        <p className="mb-1 text-[11px] font-bold uppercase text-white opacity-70">
                          {row.label}
                        </p>
                        <div className="rounded border border-stride-border/50 bg-stride-surface/50 p-2 font-mono text-sm text-stride-gray">
                          {row.hidden ? "(hidden)" : row.text}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}

              {bottomTab === "result" && (
                <div className="space-y-2">
                  {running && (
                    <div className="flex items-center gap-2 text-sm text-stride-gray">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Running...
                    </div>
                  )}
                  {executionError && (
                    <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">
                      <AlertCircle className="mr-1 inline h-4 w-4" />
                      {executionError}
                    </div>
                  )}
                  {!running &&
                    runResult?.results.map((r, idx) => {
                      const open = selectedTestIndex === idx;
                      return (
                        <div
                          key={idx}
                          className="overflow-hidden rounded border border-stride-border"
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedTestIndex(idx)}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-stride-surface"
                          >
                            <span className="flex items-center gap-2 text-white">
                              {r.passed ? (
                                <CheckCircle2 className="h-4 w-4 text-stride-accent" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-500" />
                              )}
                              {r.label || `Testcase ${idx + 1}`}
                            </span>
                            <span className="text-xs text-stride-gray">
                              {r.status}
                              {open ? (
                                <ChevronDown className="ml-1 inline h-3 w-3" />
                              ) : (
                                <ChevronRight className="ml-1 inline h-3 w-3" />
                              )}
                            </span>
                          </button>
                          {open && !r.hidden && (
                            <div className="space-y-2 border-t border-stride-border bg-stride-surface p-3 font-mono text-xs text-stride-gray">
                              <div>
                                <span className="text-stride-gray">Input: </span>
                                {r.input}
                              </div>
                              <div>
                                <span className="text-stride-gray">Expected: </span>
                                {r.expected_output}
                              </div>
                              <div>
                                <span className="text-stride-gray">Output: </span>
                                <span className={r.passed ? "text-stride-accent" : "text-red-400"}>
                                  {r.actual_output ?? "—"}
                                </span>
                              </div>
                              {r.stderr && (
                                <div className="text-red-400">{r.stderr}</div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  {!running && !runResult && !executionError && (
                    <p className="text-sm text-stride-gray">Click Run to see results.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function LanguagePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const languages = [
    { value: "python", label: "Python" },
    { value: "javascript", label: "JavaScript" },
  ];
  const current = languages.find((l) => l.value === value) ?? languages[0];

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative ml-2 border-l border-stride-border pl-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-sm font-medium text-white hover:text-stride-gray"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {current.label}
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-[calc(100%+4px)] z-[60] min-w-[148px] overflow-hidden rounded-md border border-stride-border bg-stride-surface py-1 shadow-xl"
        >
          {languages.map((lang) => (
            <button
              key={lang.value}
              type="button"
              role="option"
              aria-selected={lang.value === value}
              onClick={() => {
                onChange(lang.value);
                setOpen(false);
              }}
              className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                lang.value === value
                  ? "bg-stride-panel text-white"
                  : "text-stride-gray hover:bg-stride-panel hover:text-white"
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProblemListItem({
  title,
  difficulty,
  active,
  done,
  onClick,
}: {
  title: string;
  difficulty: string;
  active: boolean;
  done?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-0.5 w-full rounded-md px-3 py-2.5 text-left ${
        active ? "bg-stride-panel" : "hover:bg-stride-panel/70"
      }`}
    >
      <div className="flex items-center gap-1.5">
        {done && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-stride-accent" />}
        <span className="truncate text-[13px] font-medium text-white">{title}</span>
      </div>
      <span className={`mt-1 block text-xs ${difficultyBadgeClass(difficulty)} rounded px-1.5 py-0.5 w-fit`}>
        {difficulty}
      </span>
    </button>
  );
}
 