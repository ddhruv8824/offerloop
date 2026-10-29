"use client";

import { useCallback, useEffect, useState } from "react";
import { llmHeaders, loadLlmSettings } from "@offerloop/resume-studio/llm";
import type { LearnItem, LearnStatus, StudyNotes } from "./learn";
import { withBase } from "@/lib/base-path";

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(withBase(path), { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status}).`);
  return body;
}

/** The Learn list, refreshed after each change. */
export function useLearnList() {
  const [items, setItems] = useState<LearnItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setItems((await call<{ items: LearnItem[] }>("/api/learn")).items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load your Learn list.");
    }
  }, []);
  useEffect(() => void refresh(), [refresh]);
  return { items, error, refresh };
}

export const addTool = (skill: string) => call<{ key: string }>("/api/learn", { method: "POST", body: JSON.stringify({ skill }) });
export const setToolStatus = (key: string, status: LearnStatus) => call("/api/learn", { method: "PATCH", body: JSON.stringify({ key, status }) });
export const removeTool = (key: string) => call(`/api/learn?key=${encodeURIComponent(key)}`, { method: "DELETE" });

export const loadNotes = async (key: string) => (await call<{ notes: StudyNotes | null }>(`/api/learn/notes?key=${encodeURIComponent(key)}`)).notes;

/** Ask the AI (your Resume Studio AI settings) to write notes for one tool. */
export async function writeNotes(key: string, knownSkills: string[]): Promise<StudyNotes> {
  const headers = llmHeaders(loadLlmSettings());
  return (await call<{ notes: StudyNotes }>("/api/learn/notes", { method: "POST", headers, body: JSON.stringify({ key, knownSkills }) })).notes;
}
