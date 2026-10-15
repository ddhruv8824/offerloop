// File-backed storage, one folder per workspace (the browser's private id):
//
//   <data>/workspaces/<workspace>/current_resume.json
//   <data>/workspaces/<workspace>/master_profile.json
//   <data>/workspaces/<workspace>/versions/<version id>.json
//   <data>/workspaces/<workspace>/chat.json          chat memory + its step log
//   <data>/workspaces/<workspace>/runs/<run id>.json  step log of one tailoring run
//   <data>/jd_cache/<sha256 of JD>.json              shared JD-analysis cache
//
// <data> is REDLINE_DATA_DIR, else <OFFERLOOP_DATA_DIR>/redline, else ./.data/redline.

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MasterProfile, Resume, ResumeVersion, VersionMeta, Workspace } from "../lib/tailor/types";

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_RUN_LOGS = 50;

export function dataDir(): string {
  const env = process.env;
  if (env.REDLINE_DATA_DIR || env.RESUME_TAILOR_DATA_DIR) return (env.REDLINE_DATA_DIR || env.RESUME_TAILOR_DATA_DIR)!;
  return path.join(env.OFFERLOOP_DATA_DIR || path.join(process.cwd(), ".data"), "redline");
}

export const isValidId = (value: string) => ID_RE.test(value ?? "");

function workspaceDir(workspace: string): string {
  const ws = (workspace ?? "").trim();
  if (!ID_RE.test(ws)) throw new RangeError("workspace must be 1–64 letters, digits, '-' or '_'");
  return path.join(dataDir(), "workspaces", ws);
}

async function read<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null; // missing or not valid JSON
  }
}

async function write(file: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  // Write beside the file, then swap: a crash mid-write leaves the old file intact.
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await rename(tmp, file);
}

// ── JD analysis cache ─────────────────────────────────────────────────────────

const jdMemoryCache = new Map<string, unknown>();

export function jdHash(jdText: string): string {
  const normalized = jdText.trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export async function getCachedJdAnalysis<T>(key: string): Promise<T | null> {
  if (jdMemoryCache.has(key)) return jdMemoryCache.get(key) as T;
  const data = await read<T>(path.join(dataDir(), "jd_cache", `${key}.json`));
  if (data !== null) jdMemoryCache.set(key, data);
  return data;
}

export async function cacheJdAnalysis(key: string, analysis: unknown): Promise<void> {
  jdMemoryCache.set(key, analysis);
  await write(path.join(dataDir(), "jd_cache", `${key}.json`), analysis);
}

// ── workspace ─────────────────────────────────────────────────────────────────

export async function saveResumeAndProfile(workspace: string, resume: Resume, master: MasterProfile): Promise<void> {
  const dir = workspaceDir(workspace);
  await write(path.join(dir, "current_resume.json"), resume);
  await write(path.join(dir, "master_profile.json"), master);
}

export async function saveMasterProfile(workspace: string, master: MasterProfile): Promise<void> {
  await write(path.join(workspaceDir(workspace), "master_profile.json"), master);
}

export async function loadWorkspace(workspace: string): Promise<Workspace> {
  const dir = workspaceDir(workspace);
  return {
    current_resume: await read<Resume>(path.join(dir, "current_resume.json")),
    master_profile: await read<MasterProfile>(path.join(dir, "master_profile.json")),
    versions: await listVersions(workspace),
  };
}

const versionMeta = (v: Partial<ResumeVersion>): VersionMeta =>
  Object.fromEntries(
    (["id", "label", "company", "role_title", "created_at", "updated_at"] as const).map((k) => [k, v[k] ?? null]),
  ) as unknown as VersionMeta;

async function jsonFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith(".json")).map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

export async function listVersions(workspace: string): Promise<VersionMeta[]> {
  const files = await jsonFiles(path.join(workspaceDir(workspace), "versions"));
  const versions = (await Promise.all(files.map((f) => read<Partial<ResumeVersion>>(f)))).filter(
    (v): v is Partial<ResumeVersion> => !!v && typeof v === "object" && !Array.isArray(v),
  );
  const sortKey = (v: Partial<ResumeVersion>) => v.updated_at || v.created_at || "";
  versions.sort((a, b) => (sortKey(a) < sortKey(b) ? 1 : sortKey(a) > sortKey(b) ? -1 : 0));
  return versions.map(versionMeta);
}

export async function saveVersion(workspace: string, version: Partial<ResumeVersion>): Promise<VersionMeta> {
  const id = String(version.id ?? "");
  if (!ID_RE.test(id)) throw new RangeError("invalid version id");
  await write(path.join(workspaceDir(workspace), "versions", `${id}.json`), version);
  return versionMeta(version);
}

export async function getVersion(workspace: string, versionId: string): Promise<ResumeVersion | null> {
  if (!ID_RE.test(versionId)) return null;
  return read<ResumeVersion>(path.join(workspaceDir(workspace), "versions", `${versionId}.json`));
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

const chatFile = (workspace: string) => path.join(workspaceDir(workspace), "chat.json");

export async function loadChat(workspace: string): Promise<ChatFile> {
  const data = await read<Partial<ChatFile>>(chatFile(workspace));
  return { messages: data?.messages ?? [], log: data?.log ?? [] };
}

export async function appendChatTurn(workspace: string, messages: ChatMessage[], steps: LogStep[]): Promise<void> {
  const chat = await loadChat(workspace);
  await write(chatFile(workspace), {
    messages: [...chat.messages, ...messages].slice(-MAX_CHAT_MESSAGES),
    log: [...chat.log, ...steps].slice(-MAX_CHAT_LOG),
  });
}

export async function saveRunLog(workspace: string, runId: string, steps: LogStep[]): Promise<void> {
  const dir = path.join(workspaceDir(workspace), "runs");
  await write(path.join(dir, `${runId}.json`), { steps, created_at: new Date().toISOString() });
  // Keep the newest logs only. Run ids aren't ordered, so go by each log's own timestamp.
  const files = await jsonFiles(dir);
  if (files.length <= MAX_RUN_LOGS) return;
  const dated = await Promise.all(
    files.map(async (f) => ({ f, at: (await read<{ created_at?: string }>(f))?.created_at ?? "" })),
  );
  dated.sort((a, b) => (a.at < b.at ? 1 : -1));
  await Promise.all(dated.slice(MAX_RUN_LOGS).map(({ f }) => unlink(f).catch(() => undefined)));
}

export async function loadRunLog(workspace: string, runId: string): Promise<LogStep[] | null> {
  if (!ID_RE.test(runId)) return null;
  return (await read<{ steps: LogStep[] }>(path.join(workspaceDir(workspace), "runs", `${runId}.json`)))?.steps ?? null;
}
