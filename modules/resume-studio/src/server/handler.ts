// Redline API — the HTTP layer. Validates requests, calls the engine, streams results.
// Mount it on any server that speaks web-standard Request/Response (a Next.js route
// handler, Hono, Bun…) and pass the path below the mount point, e.g. for
// /api/redline/api/v1/tailor/chat → ["api", "v1", "tailor", "chat"].
//
//   POST /api/v1/tailor                       stream a tailoring run (Server-Sent Events)
//   POST /api/v1/tailor/chat                  free-form chat: edit, answer or record a fact (SSE)
//   POST /api/v1/tailor/resume                upload PDF/DOCX → current_resume + master_profile
//   POST /api/v1/tailor/resume/sample         load the built-in sample resume (no AI call)
//   GET  /api/v1/tailor/workspace             saved resume, master profile and version list
//   PUT  /api/v1/tailor/master-profile        save the master profile
//   POST /api/v1/tailor/versions              save a tailored version (one per JD)
//   GET  /api/v1/tailor/versions/{id}         load one version
//   GET  /api/v1/tailor/llm/providers         provider / model catalogue for AI settings
//   POST /api/v1/tailor/llm/verify            check a key and list the models it can use
//   GET  /api/v1/tailor/threads/{id}/history  every step of a tailoring run or the chat
//   GET  /api/v1/health
//
// The AI provider, model and (optional) user API key travel in the X-LLM-Provider /
// X-LLM-Model / X-LLM-Key headers of each request. The key is used for that request
// only; it is never stored or logged. Every stored resource belongs to a `workspace`
// (the browser's private id).

import { z } from "zod";
import type { MasterProfile, Resume, ResumeVersion } from "../lib/tailor/types";
import { runChat } from "./chat";
import { describeProviders, listModels, LlmConfigError, resolveConfig, type LlmConfig } from "./models";
import { parseResumeFile } from "./resume-parser";
import sampleResume from "./sample-resume.json";
import * as store from "./store";
import { assignIds, buildMasterProfile } from "./structure";
import { runTailor } from "./tailor";

const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx"]);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const THREAD_RE = /^([A-Za-z0-9_-]{1,64}):(chat|tailor:([a-f0-9]{8,32}))$/;

/** An error the client sees as `{ detail }` with this status (FastAPI's shape). */
class HttpError extends Error {
  constructor(readonly status: number, detail: string) {
    super(detail);
  }
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

// ── request bodies ────────────────────────────────────────────────────────────

const doc = z.record(z.string(), z.unknown());
const workspaceId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Invalid workspace id.");

const TailorRequest = z.object({
  workspace: workspaceId.default("default"),
  jd_text: z.string().min(50, "The job description is too short (50 characters minimum).").max(30_000),
  current_resume: doc,
  master_profile: doc,
});

const ChatRequest = z.object({
  workspace: workspaceId.default("default"),
  message: z.string().min(1).max(30_000),
  resume: doc,
  original: doc.nullish(),
  master_profile: doc,
  jd_analysis: doc.nullish(),
});

const WorkspaceRequest = z.object({ workspace: z.string() });
const MasterProfileRequest = z.object({ workspace: z.string(), master_profile: doc });
const SaveVersionRequest = z.object({ workspace: z.string(), version: doc });

async function body<S extends z.ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(422, "Request body must be JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HttpError(422, `${issue.path.join(".") || "body"}: ${issue.message}`);
  }
  return parsed.data;
}

function llmConfig(req: Request): LlmConfig {
  try {
    return resolveConfig(req.headers.get("x-llm-provider"), req.headers.get("x-llm-model"), req.headers.get("x-llm-key"));
  } catch (err) {
    if (err instanceof LlmConfigError) throw new HttpError(400, err.message);
    throw err;
  }
}

/** Storage rejects bad workspace / version ids with a RangeError → 400. */
async function stored<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (err) {
    if (err instanceof RangeError) throw new HttpError(400, err.message);
    throw err;
  }
}

function query(req: Request, name: string): string {
  const value = new URL(req.url).searchParams.get(name);
  if (value === null) throw new HttpError(422, `Missing query parameter '${name}'.`);
  return value;
}

/** Server-Sent Events: one `data:` frame per event. */
function sse(events: AsyncGenerator<unknown>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await events.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
    },
    async cancel() {
      await events.return(undefined);
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
  });
}

// ── endpoints ─────────────────────────────────────────────────────────────────

async function tailor(req: Request) {
  const cfg = llmConfig(req);
  const r = await body(req, TailorRequest);
  const runId = store.newRunId(); // one log per run
  return sse(
    runTailor(
      cfg,
      {
        workspace: r.workspace,
        runId,
        jdText: r.jd_text,
        resume: r.current_resume as unknown as Resume,
        master: r.master_profile as unknown as MasterProfile,
      },
      { signal: req.signal },
    ),
  );
}

async function chat(req: Request) {
  const cfg = llmConfig(req);
  const r = await body(req, ChatRequest);
  const resume = r.resume as unknown as Resume;
  return sse(
    runChat(
      cfg,
      {
        workspace: r.workspace, // one remembered conversation per workspace
        message: r.message,
        resume,
        original: (r.original as unknown as Resume | null) ?? resume,
        master: r.master_profile as unknown as MasterProfile,
        jdAnalysis: (r.jd_analysis as never) ?? null,
      },
      { signal: req.signal },
    ),
  );
}

/** Lets new users try the product before uploading their own resume (no AI call). */
async function loadSample(req: Request) {
  const { workspace } = await body(req, WorkspaceRequest);
  const resume = assignIds(structuredClone(sampleResume));
  const master = buildMasterProfile(resume);
  await stored(store.saveResumeAndProfile(workspace, resume, master));
  return json({ current_resume: resume, master_profile: master, sample: true });
}

async function uploadResume(req: Request) {
  const cfg = llmConfig(req);
  // The form is read into memory, so refuse oversized bodies before reading them.
  if (Number(req.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024) {
    throw new HttpError(413, "Resume file is larger than 10 MB.");
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(422, "Expected a multipart form with 'workspace' and 'file'.");
  }
  const workspace = form.get("workspace");
  const file = form.get("file");
  if (typeof workspace !== "string" || !(file instanceof File)) {
    throw new HttpError(422, "Expected a multipart form with 'workspace' and 'file'.");
  }
  const ext = /\.[^.]+$/.exec(file.name ?? "")?.[0].toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new HttpError(400, `Unsupported file type '${ext}'. Upload a PDF or DOCX.`);
  }
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "Resume file is larger than 10 MB.");

  let resume: Resume;
  try {
    resume = await parseResumeFile(cfg, new Uint8Array(await file.arrayBuffer()), ext);
  } catch (err) {
    throw new HttpError(422, `Could not parse resume: ${err instanceof Error ? err.message : err}`);
  }
  if (!resume.experience.length && !resume.projects.length) {
    throw new HttpError(422, "Couldn't find any experience or projects in this resume. Is it a text-based PDF?");
  }
  const master = buildMasterProfile(resume);
  await stored(store.saveResumeAndProfile(workspace, resume, master));
  return json({ current_resume: resume, master_profile: master });
}

async function verifyLlm(req: Request) {
  const cfg = llmConfig(req);
  try {
    const models = await listModels(cfg);
    return json({
      ok: true,
      models,
      model_available: models.length ? models.includes(cfg.model) : null,
      key_source: cfg.keySource,
    });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err), models: [], key_source: cfg.keySource });
  }
}

/** The run log: one entry per step, with the data it produced. */
async function threadHistory(threadId: string) {
  const match = THREAD_RE.exec(threadId);
  if (!match) throw new HttpError(400, "Invalid thread id.");
  const [, workspace, kind, runId] = match;
  const steps = kind === "chat" ? (await store.loadChat(workspace)).log : await store.loadRunLog(workspace, runId);
  if (!steps?.length) throw new HttpError(404, "No log for this thread.");
  return json({ thread_id: threadId, steps });
}

async function route(req: Request, path: string[]): Promise<Response> {
  const [api, version, ...rest] = path;
  if (api !== "api" || version !== "v1") throw new HttpError(404, "Not found.");
  const route = `${req.method} /${rest.join("/")}`;

  switch (route) {
    case "GET /health":
      return json({ status: "ok", service: "redline" });
    case "POST /tailor":
      return tailor(req);
    case "POST /tailor/chat":
      return chat(req);
    case "POST /tailor/resume":
      return uploadResume(req);
    case "POST /tailor/resume/sample":
      return loadSample(req);
    case "GET /tailor/workspace":
      return json(await stored(store.loadWorkspace(query(req, "workspace"))));
    case "PUT /tailor/master-profile": {
      const r = await body(req, MasterProfileRequest);
      await stored(store.saveMasterProfile(r.workspace, r.master_profile as unknown as MasterProfile));
      return json({ ok: true });
    }
    case "POST /tailor/versions": {
      const r = await body(req, SaveVersionRequest);
      return json(await stored(store.saveVersion(r.workspace, r.version as Partial<ResumeVersion>)));
    }
    case "GET /tailor/llm/providers":
      return json({ providers: describeProviders() });
    case "POST /tailor/llm/verify":
      return verifyLlm(req);
  }

  if (req.method === "GET" && rest[0] === "tailor" && rest[1] === "versions" && rest.length === 3) {
    const version = await stored(store.getVersion(query(req, "workspace"), rest[2]));
    if (!version) throw new HttpError(404, "Version not found");
    return json(version);
  }
  if (req.method === "GET" && rest[0] === "tailor" && rest[1] === "threads" && rest[3] === "history" && rest.length === 4) {
    return threadHistory(rest[2]);
  }
  throw new HttpError(404, "Not found.");
}

/**
 * Pin a request to one workspace, whatever the browser asked for: rewrite the `workspace`
 * query parameter, JSON field or form field, and refuse run logs of other workspaces. This is
 * how a host with accounts gives each person their own workspace.
 */
async function pinWorkspace(req: Request, path: string[], workspace: string): Promise<Request> {
  const threadId = path[0] === "api" && path[2] === "tailor" && path[3] === "threads" ? path[4] : undefined;
  if (threadId !== undefined && THREAD_RE.exec(threadId)?.[1] !== workspace) throw new HttpError(404, "No log for this thread.");

  const url = new URL(req.url);
  if (url.searchParams.has("workspace") || req.method === "GET") url.searchParams.set("workspace", workspace);
  if (req.method === "GET" || req.method === "HEAD") return new Request(url, { method: req.method, headers: req.headers, signal: req.signal });

  const type = req.headers.get("content-type") ?? "";
  const headers = new Headers(req.headers);
  headers.delete("content-length");
  if (type.includes("multipart/form-data")) {
    const form = await req.formData();
    form.set("workspace", workspace);
    headers.delete("content-type"); // the new body sets its own boundary
    return new Request(url, { method: req.method, headers, body: form, signal: req.signal });
  }
  const text = await req.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, "Expected a JSON body.");
  }
  if (body && typeof body === "object" && !Array.isArray(body)) (body as Record<string, unknown>).workspace = workspace;
  return new Request(url, { method: req.method, headers, body: JSON.stringify(body), signal: req.signal });
}

/**
 * Handle one Redline API request. `path` is the URL path below the mount point, split on "/".
 * With `workspace`, every request is pinned to that workspace (see pinWorkspace).
 */
export async function handleRedlineRequest(req: Request, path: string[], { workspace }: { workspace?: string } = {}): Promise<Response> {
  try {
    if (workspace) req = await pinWorkspace(req, path, workspace);
    return await route(req, path);
  } catch (err) {
    if (err instanceof HttpError) return json({ detail: err.message }, err.status);
    console.error("[redline]", err);
    return json({ detail: "Something went wrong in Resume Studio. Try again." }, 500);
  }
}
