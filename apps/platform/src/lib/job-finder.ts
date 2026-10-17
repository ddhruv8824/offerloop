"use client";

import "./storage-rename";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ScoredJob, SearchProfile } from "./jobs";
import type { MarketRange } from "./salary";
import type { CareerProfile } from "./types";

/** What /api/jobs/search returns. */
export interface JobSearchResult {
  jobs: ScoredJob[];
  /** Ruled out by your deal-breakers (older cached results may lack these). */
  hidden?: ScoredJob[];
  hiddenCount?: number;
  sources: { name: string; via: string; ok: boolean; scanned: number; matched: number; error?: string }[];
  scanned: number;
  matched: number;
  duplicatesMerged: number;
  fetchedAt: string;
}

export function toSearchProfile(p: CareerProfile): SearchProfile {
  return {
    targetRole: p.targetRole,
    skills: p.skills,
    locations: p.locations,
    experienceYears: p.experienceYears,
    minSalaryLpa: p.minSalaryLpa,
    currentCtcLpa: p.currentCtcLpa,
    dealBreakers: p.dealBreakers,
  };
}

const RESULT_KEY = "offerloop.jobs.result.v1";
const SEEN_KEY = "offerloop.jobs.seen.v1";
const FRESH_MS = 20 * 60 * 1000;

function readJson<T>(storage: Storage, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(storage: Storage, key: string, value: unknown) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked: the search still works, it just isn't remembered
  }
}

/** Ids of jobs that weren't in any earlier search on this browser. Empty on the very first search. */
function markSeen(jobs: ScoredJob[]): Set<string> {
  const seen = readJson<Record<string, number>>(localStorage, SEEN_KEY);
  const fresh = new Set<string>();
  const next: Record<string, number> = { ...(seen ?? {}) };
  for (const job of jobs) {
    if (!(job.id in next)) {
      if (seen) fresh.add(job.id);
      next[job.id] = Date.now();
    }
  }
  // Forget jobs not seen for 60 days so this never grows without bound.
  const cutoff = Date.now() - 60 * 86_400_000;
  writeJson(localStorage, SEEN_KEY, Object.fromEntries(Object.entries(next).filter(([, at]) => at > cutoff)));
  return fresh;
}

type State =
  | { status: "idle" | "loading"; result?: JobSearchResult; error?: undefined }
  | { status: "ready"; result: JobSearchResult; error?: undefined }
  | { status: "error"; result?: JobSearchResult; error: string };

/**
 * Search for jobs matching a profile. Results are kept for 20 minutes per profile so moving
 * between pages doesn't re-run the search; `refresh()` forces a new one.
 */
export function useJobSearch(profile: CareerProfile | null) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const running = useRef<AbortController | null>(null);
  const key = profile ? JSON.stringify(toSearchProfile(profile)) : "";

  const run = useCallback(
    async (force: boolean) => {
      if (!profile) return;
      const cachedResult = readJson<{ key: string; result: JobSearchResult }>(sessionStorage, RESULT_KEY);
      const usable = cachedResult?.key === key ? cachedResult.result : undefined;
      if (usable && !force && Date.now() - new Date(usable.fetchedAt).getTime() < FRESH_MS) {
        setState({ status: "ready", result: usable });
        return;
      }
      running.current?.abort();
      const controller = new AbortController();
      running.current = controller;
      setState({ status: "loading", result: usable });
      try {
        const res = await fetch("/api/jobs/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile: toSearchProfile(profile) }),
          signal: controller.signal,
        });
        const data = (await res.json()) as JobSearchResult & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Job search failed.");
        writeJson(sessionStorage, RESULT_KEY, { key, result: data });
        setNewIds(markSeen(data.jobs));
        setState({ status: "ready", result: data });
      } catch (err) {
        if (controller.signal.aborted) return;
        setState({ status: "error", result: usable, error: err instanceof Error ? err.message : "Job search failed." });
      }
    },
    [profile, key],
  );

  useEffect(() => {
    void run(false);
    return () => running.current?.abort();
  }, [run]);

  return { ...state, newIds, refresh: () => run(true) };
}

/* ── Salary market ────────────────────────────────────── */

export interface SalaryMarketResult {
  range: MarketRange | null;
  totalObservations: number;
}

const MARKET_KEY = "offerloop.jobs.market.v1";
const MARKET_FRESH_MS = 30 * 60 * 1000;

type MarketState = { status: "idle" | "loading" } | { status: "ready"; market: SalaryMarketResult } | { status: "error"; error: string };

/**
 * What roles like this profile's target pay. The first request for a role takes ~20 seconds
 * (the server samples a few hundred postings); the answer is then kept for 30 minutes here.
 */
export function useSalaryMarket(profile: CareerProfile | null): MarketState {
  const [state, setState] = useState<MarketState>({ status: "idle" });
  // Only what changes the market: pay and skills don't.
  const key = profile ? JSON.stringify([profile.targetRole, profile.experienceYears, profile.locations]) : "";

  useEffect(() => {
    if (!profile) return;
    const cachedMarket = readJson<{ key: string; at: number; market: SalaryMarketResult }>(sessionStorage, MARKET_KEY);
    if (cachedMarket?.key === key && Date.now() - cachedMarket.at < MARKET_FRESH_MS) {
      setState({ status: "ready", market: cachedMarket.market });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading" });
    fetch("/api/jobs/market", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile: toSearchProfile(profile) }), signal: controller.signal })
      .then(async (res) => {
        const data = (await res.json()) as SalaryMarketResult & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Couldn't build the salary guide.");
        writeJson(sessionStorage, MARKET_KEY, { key, at: Date.now(), market: data });
        setState({ status: "ready", market: data });
      })
      .catch((err) => {
        if (!controller.signal.aborted) setState({ status: "error", error: err instanceof Error ? err.message : "Couldn't build the salary guide." });
      });
    return () => controller.abort();
    // `key` covers every profile field the market depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}

/** "Paste a link": read and score one posting. */
export async function importJobLink(url: string, profile: CareerProfile): Promise<ScoredJob> {
  const res = await fetch("/api/jobs/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, profile: toSearchProfile(profile) }),
  });
  const data = (await res.json()) as { job?: ScoredJob; error?: string };
  if (!res.ok || !data.job) throw new Error(data.error ?? "Couldn't read that link.");
  return data.job;
}
