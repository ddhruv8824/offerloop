"use client";

import "./storage-rename";
import { useEffect, useState } from "react";

/**
 * DSA Prep: most-asked LeetCode questions per company and per domain.
 *
 * Questions are links to leetcode.com — we keep only the title, slug, difficulty
 * and topics, never problem statements. Company lists below are SAMPLE data for
 * the sample companies; a real company-frequency source plugs in at
 * `companyList()`. Domain lists are curated starter lists, not frequencies.
 */

export type Difficulty = "Easy" | "Medium" | "Hard";

export interface Question {
  slug: string;
  title: string;
  difficulty: Difficulty;
  topics: string[];
}

const q = (slug: string, title: string, difficulty: Difficulty, ...topics: string[]): Question => ({ slug, title, difficulty, topics });

export const QUESTIONS: Question[] = [
  q("two-sum", "Two Sum", "Easy", "Array", "Hash Table"),
  q("valid-parentheses", "Valid Parentheses", "Easy", "Stack", "String"),
  q("merge-two-sorted-lists", "Merge Two Sorted Lists", "Easy", "Linked List"),
  q("best-time-to-buy-and-sell-stock", "Best Time to Buy and Sell Stock", "Easy", "Array", "Dynamic Programming"),
  q("valid-anagram", "Valid Anagram", "Easy", "Hash Table", "String"),
  q("binary-search", "Binary Search", "Easy", "Binary Search"),
  q("reverse-linked-list", "Reverse Linked List", "Easy", "Linked List"),
  q("contains-duplicate", "Contains Duplicate", "Easy", "Array", "Hash Table"),
  q("climbing-stairs", "Climbing Stairs", "Easy", "Dynamic Programming"),
  q("maximum-subarray", "Maximum Subarray", "Medium", "Array", "Dynamic Programming"),
  q("longest-substring-without-repeating-characters", "Longest Substring Without Repeating Characters", "Medium", "String", "Sliding Window"),
  q("3sum", "3Sum", "Medium", "Array", "Two Pointers"),
  q("container-with-most-water", "Container With Most Water", "Medium", "Array", "Two Pointers"),
  q("group-anagrams", "Group Anagrams", "Medium", "Hash Table", "String"),
  q("top-k-frequent-elements", "Top K Frequent Elements", "Medium", "Hash Table", "Heap"),
  q("product-of-array-except-self", "Product of Array Except Self", "Medium", "Array", "Prefix Sum"),
  q("merge-intervals", "Merge Intervals", "Medium", "Array", "Sorting"),
  q("insert-interval", "Insert Interval", "Medium", "Array"),
  q("number-of-islands", "Number of Islands", "Medium", "Graph", "BFS / DFS"),
  q("course-schedule", "Course Schedule", "Medium", "Graph", "Topological Sort"),
  q("clone-graph", "Clone Graph", "Medium", "Graph", "BFS / DFS"),
  q("rotting-oranges", "Rotting Oranges", "Medium", "Graph", "BFS / DFS"),
  q("accounts-merge", "Accounts Merge", "Medium", "Graph", "Union Find"),
  q("lru-cache", "LRU Cache", "Medium", "Design", "Hash Table", "Linked List"),
  q("min-stack", "Min Stack", "Medium", "Design", "Stack"),
  q("time-based-key-value-store", "Time Based Key-Value Store", "Medium", "Design", "Binary Search"),
  q("implement-trie-prefix-tree", "Implement Trie (Prefix Tree)", "Medium", "Design", "Trie"),
  q("flatten-nested-list-iterator", "Flatten Nested List Iterator", "Medium", "Design", "Stack"),
  q("kth-largest-element-in-an-array", "Kth Largest Element in an Array", "Medium", "Heap", "Sorting"),
  q("task-scheduler", "Task Scheduler", "Medium", "Greedy", "Heap"),
  q("search-in-rotated-sorted-array", "Search in Rotated Sorted Array", "Medium", "Binary Search"),
  q("coin-change", "Coin Change", "Medium", "Dynamic Programming"),
  q("house-robber", "House Robber", "Medium", "Dynamic Programming"),
  q("jump-game", "Jump Game", "Medium", "Greedy", "Dynamic Programming"),
  q("longest-increasing-subsequence", "Longest Increasing Subsequence", "Medium", "Dynamic Programming", "Binary Search"),
  q("edit-distance", "Edit Distance", "Medium", "Dynamic Programming", "String"),
  q("longest-palindromic-substring", "Longest Palindromic Substring", "Medium", "String", "Dynamic Programming"),
  q("word-search", "Word Search", "Medium", "Backtracking", "Matrix"),
  q("subsets", "Subsets", "Medium", "Backtracking"),
  q("permutations", "Permutations", "Medium", "Backtracking"),
  q("combination-sum", "Combination Sum", "Medium", "Backtracking"),
  q("binary-tree-level-order-traversal", "Binary Tree Level Order Traversal", "Medium", "Tree", "BFS / DFS"),
  q("validate-binary-search-tree", "Validate Binary Search Tree", "Medium", "Tree"),
  q("lowest-common-ancestor-of-a-binary-tree", "Lowest Common Ancestor of a Binary Tree", "Medium", "Tree"),
  q("daily-temperatures", "Daily Temperatures", "Medium", "Stack"),
  q("decode-string", "Decode String", "Medium", "Stack", "String"),
  q("asteroid-collision", "Asteroid Collision", "Medium", "Stack"),
  q("spiral-matrix", "Spiral Matrix", "Medium", "Matrix"),
  q("rotate-image", "Rotate Image", "Medium", "Matrix"),
  q("set-matrix-zeroes", "Set Matrix Zeroes", "Medium", "Matrix"),
  q("trapping-rain-water", "Trapping Rain Water", "Hard", "Two Pointers", "Stack"),
  q("merge-k-sorted-lists", "Merge k Sorted Lists", "Hard", "Linked List", "Heap"),
  q("median-of-two-sorted-arrays", "Median of Two Sorted Arrays", "Hard", "Binary Search"),
  q("minimum-window-substring", "Minimum Window Substring", "Hard", "String", "Sliding Window"),
  q("sliding-window-maximum", "Sliding Window Maximum", "Hard", "Sliding Window", "Heap"),
  q("word-ladder", "Word Ladder", "Hard", "Graph", "BFS / DFS"),
  q("serialize-and-deserialize-binary-tree", "Serialize and Deserialize Binary Tree", "Hard", "Tree", "Design"),
  q("find-median-from-data-stream", "Find Median from Data Stream", "Hard", "Heap", "Design"),
];

export const QUESTION_BY_SLUG = Object.fromEntries(QUESTIONS.map((x) => [x.slug, x])) as Record<string, Question>;

export const leetcodeUrl = (slug: string) => `https://leetcode.com/problems/${slug}/`;

/* ── Lists ────────────────────────────────────────────── */

/** A question in a list, with how often it's asked (0–100) when that's known. */
export interface ListItem {
  question: Question;
  frequency?: number;
}

export interface QuestionList {
  id: string;
  name: string;
  kind: "company" | "domain";
  /** Shown under the list so nobody mistakes samples for real data. */
  sourceNote: string;
  items: ListItem[];
}

const fromFreq = (entries: [string, number][]): ListItem[] =>
  entries.filter(([slug]) => QUESTION_BY_SLUG[slug]).map(([slug, frequency]) => ({ question: QUESTION_BY_SLUG[slug], frequency }));

const fromSlugs = (slugs: string[]): ListItem[] => slugs.filter((s) => QUESTION_BY_SLUG[s]).map((s) => ({ question: QUESTION_BY_SLUG[s] }));

const SAMPLE_NOTE = "Sample frequencies for a sample company. Real company lists plug in from a question dataset.";

/** Company → most-asked questions with frequency. SAMPLE data for the sample companies. */
const COMPANY_LISTS: Record<string, [string, number][]> = {
  "northwind-pay": [
    ["two-sum", 96], ["best-time-to-buy-and-sell-stock", 91], ["lru-cache", 88], ["merge-intervals", 82], ["valid-parentheses", 78],
    ["coin-change", 71], ["maximum-subarray", 69], ["time-based-key-value-store", 64], ["group-anagrams", 60], ["top-k-frequent-elements", 55],
    ["minimum-window-substring", 47], ["product-of-array-except-self", 44],
  ],
  "lumen-health": [
    ["number-of-islands", 90], ["merge-intervals", 84], ["valid-parentheses", 80], ["two-sum", 76], ["rotting-oranges", 70],
    ["decode-string", 63], ["binary-tree-level-order-traversal", 58], ["kth-largest-element-in-an-array", 52], ["course-schedule", 49], ["longest-substring-without-repeating-characters", 45],
  ],
  quillstack: [
    ["lru-cache", 92], ["implement-trie-prefix-tree", 85], ["top-k-frequent-elements", 79], ["course-schedule", 72], ["word-search", 66],
    ["edit-distance", 61], ["serialize-and-deserialize-binary-tree", 55], ["find-median-from-data-stream", 50], ["task-scheduler", 43],
  ],
  "orbit-logistics": [
    ["number-of-islands", 93], ["rotting-oranges", 86], ["word-ladder", 77], ["course-schedule", 73], ["merge-intervals", 68],
    ["task-scheduler", 62], ["kth-largest-element-in-an-array", 57], ["spiral-matrix", 51],
  ],
  fernbank: [
    ["two-sum", 94], ["best-time-to-buy-and-sell-stock", 87], ["lru-cache", 83], ["accounts-merge", 74], ["merge-intervals", 70],
    ["valid-parentheses", 66], ["sliding-window-maximum", 58], ["median-of-two-sorted-arrays", 49],
  ],
};

export const DOMAINS: { id: string; name: string; slugs: string[] }[] = [
  {
    id: "must-know",
    name: "Must-know (any role)",
    slugs: ["two-sum", "valid-parentheses", "best-time-to-buy-and-sell-stock", "merge-intervals", "longest-substring-without-repeating-characters", "3sum", "group-anagrams", "top-k-frequent-elements", "product-of-array-except-self", "number-of-islands", "course-schedule", "lru-cache", "binary-tree-level-order-traversal", "validate-binary-search-tree", "coin-change", "search-in-rotated-sorted-array", "kth-largest-element-in-an-array", "trapping-rain-water", "merge-k-sorted-lists", "minimum-window-substring"],
  },
  {
    id: "frontend",
    name: "Frontend",
    slugs: ["two-sum", "valid-parentheses", "group-anagrams", "merge-intervals", "lru-cache", "decode-string", "flatten-nested-list-iterator", "min-stack", "top-k-frequent-elements", "longest-substring-without-repeating-characters", "daily-temperatures", "implement-trie-prefix-tree", "product-of-array-except-self", "spiral-matrix", "number-of-islands"],
  },
  {
    id: "backend",
    name: "Backend & systems",
    slugs: ["lru-cache", "time-based-key-value-store", "task-scheduler", "course-schedule", "merge-k-sorted-lists", "find-median-from-data-stream", "kth-largest-element-in-an-array", "accounts-merge", "number-of-islands", "serialize-and-deserialize-binary-tree", "top-k-frequent-elements", "min-stack", "word-ladder", "clone-graph"],
  },
  {
    id: "fintech",
    name: "Fintech",
    slugs: ["best-time-to-buy-and-sell-stock", "maximum-subarray", "coin-change", "merge-intervals", "two-sum", "lru-cache", "time-based-key-value-store", "accounts-merge", "kth-largest-element-in-an-array", "sliding-window-maximum", "minimum-window-substring"],
  },
  {
    id: "data",
    name: "Data & ML",
    slugs: ["top-k-frequent-elements", "kth-largest-element-in-an-array", "find-median-from-data-stream", "merge-intervals", "group-anagrams", "product-of-array-except-self", "longest-increasing-subsequence", "edit-distance", "sliding-window-maximum", "number-of-islands"],
  },
];

export function companyList(companySlug: string, companyName: string): QuestionList | null {
  const entries = COMPANY_LISTS[companySlug];
  if (!entries) return null;
  return { id: `company:${companySlug}`, name: companyName, kind: "company", sourceNote: SAMPLE_NOTE, items: fromFreq(entries) };
}

export function domainList(domainId: string): QuestionList {
  const d = DOMAINS.find((x) => x.id === domainId) ?? DOMAINS[0];
  return {
    id: `domain:${d.id}`,
    name: d.name,
    kind: "domain",
    sourceNote: "Curated starter list of commonly asked questions for this kind of role — not company-specific.",
    items: fromSlugs(d.slugs),
  };
}

/** The best domain list for a role title, used when a company has no list yet. */
export function domainForRole(role?: string) {
  const r = (role ?? "").toLowerCase();
  if (/front|ui|react|web/.test(r)) return "frontend";
  if (/back|platform|infra|sre|devops/.test(r)) return "backend";
  if (/data|ml|machine|ai\b|analytics/.test(r)) return "data";
  return "must-know";
}

/* ── Personal progress (this browser) ─────────────────── */

export type QuestionStatus = "solved" | "revisit";

interface DsaState {
  status: Record<string, QuestionStatus>;
  saved: string[];
  /** Last question opened on LeetCode — to ask "did you solve it?" when the user comes back. */
  lastOpened?: { slug: string; at: number };
}

const KEY = "offerloop.dsa.v1";
const EVENT = "offerloop:dsa";

function read(): DsaState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as DsaState;
  } catch {
    // fresh state
  }
  return { status: {}, saved: [] };
}

function update(fn: (s: DsaState) => DsaState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(fn(read())));
  } catch {
    // storage blocked
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useDsa() {
  const [state, setState] = useState<DsaState | null>(null);
  useEffect(() => {
    const sync = () => setState(read());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return state;
}

export function setStatus(slug: string, status: QuestionStatus | null) {
  update((s) => {
    const next = { ...s.status };
    if (status) next[slug] = status;
    else delete next[slug];
    return { ...s, status: next, lastOpened: s.lastOpened?.slug === slug ? undefined : s.lastOpened };
  });
}

export function toggleSaved(slug: string) {
  update((s) => ({ ...s, saved: s.saved.includes(slug) ? s.saved.filter((x) => x !== slug) : [...s.saved, slug] }));
}

export function markOpened(slug: string) {
  update((s) => ({ ...s, lastOpened: { slug, at: Date.now() } }));
}

export function clearOpened() {
  update((s) => ({ ...s, lastOpened: undefined }));
}
