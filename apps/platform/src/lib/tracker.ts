"use client";

import "./storage-rename";
import { useEffect, useState } from "react";
import type { Confidence, EmailKind } from "./email-classifier";
import { getCompany, JOBS, TRACKER } from "./sample-data";
import { STATUS_ORDER, type ApplicationStatus } from "./types";

/**
 * The tracker: one card per job, each with a timeline. Lives in this browser's
 * localStorage until the shared backend exists.
 *
 * Email updates (from /api/inbox/scan) are applied here:
 *  - high confidence + matched card + moves forward → card moves, with an undo
 *  - low confidence or no matching card            → a suggestion the user confirms
 *  - same or earlier status                        → logged on the timeline only
 */

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  in_review: "In review",
  assessment: "Assessment",
  interview: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
};

export type EventSource = "you" | "email" | "workflow" | "sample";

export interface TrackerEvent {
  id: string;
  at: string;
  text: string;
  source: EventSource;
  from?: ApplicationStatus;
  to?: ApplicationStatus;
  evidence?: string;
  /** The Gmail message an email event came from — for "Open in Gmail". */
  messageId?: string;
  undone?: boolean;
}

export interface TrackerCard {
  id: string;
  title: string;
  company: string;
  companySlug?: string;
  jobId?: string;
  url?: string;
  source?: string;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
  matchScore?: number;
  resumeVersion?: string;
  practiceScore?: number;
  nextStep?: string;
  notes?: string;
  sample?: boolean;
  events: TrackerEvent[];
}

/** One classified email, as returned by /api/inbox/scan (no body). */
export interface InboxDetection {
  messageId: string;
  date: string;
  from: string;
  subject: string;
  kind: EmailKind;
  confidence: Confidence;
  evidence: string;
}

export interface Suggestion {
  detection: InboxDetection;
  cardId?: string;
  reason: "low-confidence" | "no-match";
}

interface TrackerState {
  cards: TrackerCard[];
  processedEmails: string[];
  suggestions: Suggestion[];
  lastScanAt?: string;
  seeded?: boolean;
}

const KEY = "offerloop.tracker.v1";
const EVENT = "offerloop:tracker";

const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toISOString();
const daysAgoIso = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/* ── Storage ──────────────────────────────────────────── */

function sampleCards(): TrackerCard[] {
  return TRACKER.map((t) => {
    const job = JOBS.find((j) => j.id === t.jobId)!;
    const company = getCompany(job.companySlug)!;
    const at = daysAgoIso(t.updatedDaysAgo);
    return {
      id: `sample-${t.jobId}`,
      title: job.title,
      company: company.name,
      companySlug: company.slug,
      jobId: job.id,
      source: job.source,
      status: t.status,
      createdAt: at,
      updatedAt: at,
      matchScore: job.matchScore,
      resumeVersion: t.resumeVersion,
      practiceScore: t.practiceScore,
      nextStep: t.nextStep,
      sample: true,
      events: [{ id: uid(), at, text: `Added as ${STATUS_LABEL[t.status]} (sample card)`, source: "sample", to: t.status }],
    };
  });
}

function read(): TrackerState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as TrackerState;
  } catch {
    // fall through to a fresh state
  }
  return { cards: sampleCards(), processedEmails: [], suggestions: [], seeded: true };
}

function write(state: TrackerState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage blocked: changes last for this page only.
  }
  window.dispatchEvent(new Event(EVENT));
}

function update(fn: (s: TrackerState) => TrackerState) {
  write(fn(read()));
}

export function useTracker() {
  const [state, setState] = useState<TrackerState | null>(null);
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

/* ── Card actions ─────────────────────────────────────── */

export function addCard(input: {
  title: string;
  company: string;
  url?: string;
  status: ApplicationStatus;
  jobId?: string;
  source?: string;
  matchScore?: number;
  /** Set when a workflow adds the card: its name, shown on the card's timeline. */
  byWorkflow?: string;
}) {
  const at = now();
  const job = input.jobId ? JOBS.find((j) => j.id === input.jobId) : undefined;
  const card: TrackerCard = {
    id: uid(),
    title: input.title.trim(),
    company: input.company.trim(),
    companySlug: job?.companySlug,
    jobId: input.jobId,
    url: input.url?.trim() || undefined,
    source: input.source,
    status: input.status,
    matchScore: input.matchScore ?? job?.matchScore,
    createdAt: at,
    updatedAt: at,
    events: [
      input.byWorkflow
        ? { id: uid(), at, text: `Added by your workflow “${input.byWorkflow}”`, source: "workflow", to: input.status }
        : { id: uid(), at, text: `Added as ${STATUS_LABEL[input.status]}`, source: "you", to: input.status },
    ],
  };
  update((s) => ({ ...s, cards: [card, ...s.cards] }));
  return card.id;
}

/** Links already on the board, so nothing is added twice. */
export function trackedUrls(): Set<string> {
  return new Set(read().cards.map((c) => c.url).filter((u): u is string => Boolean(u)));
}

export function moveCard(cardId: string, to: ApplicationStatus) {
  update((s) => ({
    ...s,
    cards: s.cards.map((c) =>
      c.id === cardId && c.status !== to
        ? { ...c, status: to, updatedAt: now(), events: [...c.events, { id: uid(), at: now(), text: `Moved to ${STATUS_LABEL[to]}`, source: "you", from: c.status, to }] }
        : c,
    ),
  }));
}

export function setNotes(cardId: string, notes: string) {
  update((s) => ({ ...s, cards: s.cards.map((c) => (c.id === cardId ? { ...c, notes } : c)) }));
}

export function removeCard(cardId: string) {
  update((s) => ({ ...s, cards: s.cards.filter((c) => c.id !== cardId), suggestions: s.suggestions.filter((x) => x.cardId !== cardId) }));
}

export function clearSampleCards() {
  update((s) => ({ ...s, cards: s.cards.filter((c) => !c.sample), suggestions: s.suggestions.filter((x) => !x.cardId?.startsWith("sample-")) }));
}

/** Undo an automatic move: put the card back where it was, keep the history. */
export function undoEvent(cardId: string, eventId: string) {
  update((s) => ({
    ...s,
    cards: s.cards.map((c) => {
      const ev = c.events.find((e) => e.id === eventId);
      if (c.id !== cardId || !ev?.from || !ev.to || ev.undone) return c;
      return {
        ...c,
        status: c.status === ev.to ? ev.from : c.status,
        updatedAt: now(),
        events: [
          ...c.events.map((e) => (e.id === eventId ? { ...e, undone: true } : e)),
          { id: uid(), at: now(), text: `Undid “${STATUS_LABEL[ev.to]}” — back to ${STATUS_LABEL[ev.from]}`, source: "you", from: ev.to, to: ev.from },
        ],
      };
    }),
  }));
}

/* ── Email updates ────────────────────────────────────── */

const STATUS_FOR: Record<EmailKind, ApplicationStatus> = {
  applied: "applied",
  in_review: "in_review",
  assessment: "assessment",
  interview: "interview",
  offer: "offer",
  rejected: "rejected",
};

const rank = (s: ApplicationStatus) => STATUS_ORDER.indexOf(s);

/** Automatic moves only go forward; nothing automatic leaves Offer or Rejected. */
export function movesForward(current: ApplicationStatus, to: ApplicationStatus) {
  if (current === "rejected" || current === "offer") return false;
  return rank(to) > rank(current);
}

const STOP = new Set(["the", "a", "an", "and", "of", "for", "at", "in", "to", "ii", "i", "iii", "engineer", "developer", "senior", "junior", "role"]);
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(inc|ltd|llc|pvt|private|limited|technologies|technology|corp|co)\b\.?/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Which card an email is about: company name in sender/subject, plus job-title words as a tie-breaker. */
export function matchCard(det: InboxDetection, cards: TrackerCard[]): TrackerCard | undefined {
  const hay = norm(`${det.from} ${det.subject}`);
  const compactHay = hay.replace(/ /g, "");
  let best: { card: TrackerCard; score: number } | undefined;
  for (const card of cards) {
    const company = norm(card.company);
    if (company.length < 3) continue; // too short to match safely
    let score = 0;
    if (hay.includes(company) || compactHay.includes(company.replace(/ /g, ""))) score += 2;
    if (score === 0) continue;
    const titleWords = norm(card.title).split(" ").filter((w) => w.length > 2 && !STOP.has(w));
    score += titleWords.filter((w) => hay.includes(w)).length;
    if (card.status === "rejected" || card.status === "offer") score -= 0.5; // prefer open applications
    if (!best || score > best.score || (score === best.score && card.updatedAt > best.card.updatedAt)) best = { card, score };
  }
  return best?.card;
}

export interface ScanSummary {
  moved: number;
  suggested: number;
  logged: number;
}

/** `checkedIds`: every email the scan looked at, so non-job emails aren't fetched again next time. */
export function applyDetections(detections: InboxDetection[], checkedIds: string[] = []): ScanSummary {
  const summary: ScanSummary = { moved: 0, suggested: 0, logged: 0 };
  update((s) => {
    const processed = new Set(s.processedEmails);
    let cards = s.cards;
    const suggestions = [...s.suggestions];

    for (const det of detections) {
      if (processed.has(det.messageId)) continue;
      processed.add(det.messageId);
      const to = STATUS_FOR[det.kind];
      const card = matchCard(det, cards);

      if (!card) {
        suggestions.push({ detection: det, reason: "no-match" });
        summary.suggested++;
        continue;
      }
      if (det.confidence === "low") {
        suggestions.push({ detection: det, cardId: card.id, reason: "low-confidence" });
        summary.suggested++;
        continue;
      }

      const forward = movesForward(card.status, to);
      const event: TrackerEvent = forward
        ? { id: uid(), at: now(), text: `Moved to ${STATUS_LABEL[to]} — email “${det.subject}”`, source: "email", from: card.status, to, evidence: det.evidence, messageId: det.messageId }
        : { id: uid(), at: now(), text: `Email: “${det.subject}” (${STATUS_LABEL[to]}, no change)`, source: "email", evidence: det.evidence, messageId: det.messageId };
      cards = cards.map((c) =>
        c.id === card.id ? { ...c, status: forward ? to : c.status, updatedAt: forward ? now() : c.updatedAt, events: [...c.events, event] } : c,
      );
      if (forward) summary.moved++;
      else summary.logged++;
    }
    checkedIds.forEach((id) => processed.add(id));
    return { ...s, cards, suggestions, processedEmails: [...processed].slice(-2000), lastScanAt: now() };
  });
  return summary;
}

/** Accept a suggestion: move the chosen card (the user decided, so any direction is fine). */
export function acceptSuggestion(messageId: string, cardId: string) {
  update((s) => {
    const sug = s.suggestions.find((x) => x.detection.messageId === messageId);
    if (!sug) return s;
    const to = STATUS_FOR[sug.detection.kind];
    return {
      ...s,
      suggestions: s.suggestions.filter((x) => x !== sug),
      cards: s.cards.map((c) =>
        c.id === cardId
          ? {
              ...c,
              status: to,
              updatedAt: now(),
              events: [
                ...c.events,
                { id: uid(), at: now(), text: `Moved to ${STATUS_LABEL[to]} — you confirmed email “${sug.detection.subject}”`, source: "email", from: c.status, to, evidence: sug.detection.evidence, messageId: sug.detection.messageId },
              ],
            }
          : c,
      ),
    };
  });
}

export function dismissSuggestion(messageId: string) {
  update((s) => ({ ...s, suggestions: s.suggestions.filter((x) => x.detection.messageId !== messageId) }));
}

export function companiesToWatch(cards: TrackerCard[]) {
  return [...new Set(cards.filter((c) => c.status !== "rejected" && c.status !== "offer").map((c) => c.company))];
}
