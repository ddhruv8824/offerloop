// Resume Studio's saved data, one group of keys per workspace (the browser's private id):
//
//   workspaces/<workspace>/current_resume
//   workspaces/<workspace>/master_profile
//   workspaces/<workspace>/versions/<version id>
//   workspaces/<workspace>/chat               chat memory + its step log
//   workspaces/<workspace>/runs/<run id>      step log of one tailoring run
//   jd_cache/<sha256 of JD>                   shared JD-analysis cache
//
// Kept by @offerloop/storage: in the database when DATABASE_URL is set (namespace
// "redline"), otherwise as JSON files under REDLINE_DATA_DIR, else
// <OFFERLOOP_DATA_DIR>/redline, else ./.data/redline.

import { createHash } from "node:crypto";
import path from "node:path";
import { openStorage } from "@offerloop/storage";
import type { MasterProfile, Resume, ResumeVersion, VersionMeta, Workspace } from "../lib/tailor/types";

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_RUN_LOGS = 30;

export function dataDir(): string {
  const env = process.env;
  if (env.REDLINE_DATA_DIR || env.RESUME_TAILOR_DATA_DIR) return (env.REDLINE_DATA_DIR || env.RESUME_TAILOR_DATA_DIR)!;
  return path.join(env.OFFERLOOP_DATA_DIR || path.join(process.cwd(), ".data"), "redline");
}

const storage = () => openStorage({ fileRoot: dataDir(), namespace: "redline" });

export const isValidId = (value: string) => ID_RE.test(value ?? "");

function workspaceKey(workspace: string): string {
  const ws = (workspace ?? "").trim();
  if (!ID_RE.test(ws)) throw new RangeError("workspace must be 1–64 letters, digits, '-' or '_'");
  return `workspaces/${ws}`;
}

/** Missing or unreadable data counts as none. */
async function read<T>(key: string): Promise<T | null> {
  try {
    return await storage().get<T>(key);
  } catch (err) {
    if (err instanceof SyntaxError) return null; // a damaged file
    throw err;
  }
}

const write = (key: string, data: unknown) => storage().set(key, data);

// ── JD analysis cache ─────────────────────────────────────────────────────────

const jdMemoryCache = new Map<string, unknown>();

export function jdHash(jdText: string): string {
  const normalized = jdText.trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export async function getCachedJdAnalysis<T>(key: string): Promise<T | null> {
  if (jdMemoryCache.has(key)) return jdMemoryCache.get(key) as T;
  const data = await read<T>(`jd_cache/${key}`);
  if (data !== null) jdMemoryCache.set(key, data);
  return data;
}

export async function cacheJdAnalysis(key: string, analysis: unknown): Promise<void> {
  jdMemoryCache.set(key, analysis);
  await write(`jd_cache/${key}`, analysis);
}

// ── workspace ─────────────────────────────────────────────────────────────────

export async function saveResumeAndProfile(workspace: string, resume: Resume, master: MasterProfile): Promise<void> {
  const ws = workspaceKey(workspace);
  await write(`${ws}/current_resume`, resume);
  await write(`${ws}/master_profile`, master);
}

export async function saveMasterProfile(workspace: string, master: MasterProfile): Promise<void> {
  await write(`${workspaceKey(workspace)}/master_profile`, master);
}

export async function loadWorkspace(workspace: string): Promise<Workspace> {
  const ws = workspaceKey(workspace);
  const [current_resume, master_profile, versions] = await Promise.all([
    read<Resume>(`${ws}/current_resume`),
    read<MasterProfile>(`${ws}/master_profile`),
    listVersions(workspace),
  ]);
  return { current_resume, master_profile, versions };
}

const versionMeta = (v: Partial<ResumeVersion>): VersionMeta =>
  Object.fromEntries(
    (["id", "label", "company", "role_title", "created_at", "updated_at"] as const).map((k) => [k, v[k] ?? null]),
  ) as unknown as VersionMeta;

export async function listVersions(workspace: string): Promise<VersionMeta[]> {
  const entries = await storage().list<Partial<ResumeVersion>>(`${workspaceKey(workspace)}/versions/`);
  const versions = entries
    .map((e) => e.value)
    .filter((v): v is Partial<ResumeVersion> => !!v && typeof v === "object" && !Array.isArray(v));
  const sortKey = (v: Partial<ResumeVersion>) => v.updated_at || v.created_at || "";
  versions.sort((a, b) => (sortKey(a) < sortKey(b) ? 1 : sortKey(a) > sortKey(b) ? -1 : 0));
  return versions.map(versionMeta);
}

export async function saveVersion(workspace: string, version: Partial<ResumeVersion>): Promise<VersionMeta> {
  const id = String(version.id ?? "");
  if (!ID_RE.test(id)) throw new RangeError("invalid version id");
  await write(`${workspaceKey(workspace)}/versions/${id}`, version);
  return versionMeta(version);
}

export async function getVersion(workspace: string, versionId: string): Promise<ResumeVersion | null> {
  if (!ID_RE.test(versionId)) return null;
  return read<ResumeVersion>(`${workspaceKey(workspace)}/versions/${versionId}`);
}

// ── step logs and chat memory ─────────────────────────────────────────────────

/** One step of a tailoring run or chat turn, with the data it produced. */
export interface LogStep {
  step: number;
  node: string;
  created_at: string;
  state: unknown;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatFile {
  messages: ChatMessage[];
  log: LogStep[];
}

const MAX_CHAT_MESSAGES = 200;
const MAX_CHAT_LOG = 300;

const chatKey = (workspace: string) => `${workspaceKey(workspace)}/chat`;

export async function loadChat(workspace: string): Promise<ChatFile> {
  const data = await read<Partial<ChatFile>>(chatKey(workspace));
  return { messages: data?.messages ?? [], log: data?.log ?? [] };
}

export async function appendChatTurn(workspace: string, messages: ChatMessage[], steps: LogStep[]): Promise<void> {
  const chat = await loadChat(workspace);
  await write(chatKey(workspace), {
    messages: [...chat.messages, ...messages].slice(-MAX_CHAT_MESSAGES),
    log: [...chat.log, ...steps].slice(-MAX_CHAT_LOG),
  });
}

/** A new run id: the time in hex first, so ids sort oldest → newest. */
export function newRunId(): string {
  return Date.now().toString(16).padStart(12, "0") + Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
}

export async function saveRunLog(workspace: string, runId: string, steps: LogStep[]): Promise<void> {
  const prefix = `${workspaceKey(workspace)}/runs/`;
  const s = storage();
  await s.set(prefix + runId, { steps, created_at: new Date().toISOString() });
  // Keep the newest logs only. Ids start with their time, so sorting the keys is enough.
  const keys = (await s.keys(prefix)).sort();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_RUN_LOGS)).map((k) => s.delete(k)));
}

export async function loadRunLog(workspace: string, runId: string): Promise<LogStep[] | null> {
  if (!ID_RE.test(runId)) return null;
  return (await read<{ steps: LogStep[] }>(`${workspaceKey(workspace)}/runs/${runId}`))?.steps ?? null;
}
