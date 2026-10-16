// Everything about *which* AI model we talk to.
//
//   LlmConfig        which provider + model + key a request uses
//   resolveConfig    build an LlmConfig from the request headers (or server env keys)
//   ask              send messages, get back a validated object
//   listModels       check a key works and list the models it can use
//
// Bring your own key: the user's key arrives per request (X-LLM-Key header) and is
// only ever passed to the provider — never stored or logged.

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output, RetryError, tool, type LanguageModel, type ModelMessage } from "ai";
import type { z } from "zod";

// ── Provider catalogue ────────────────────────────────────────────────────────

export type ProviderId = "gemini" | "openai" | "anthropic" | "groq";

interface Provider {
  label: string;
  keyEnv: string[];
  models: string[];
  defaultModel: string;
  keyUrl: string;
  keyPrefixes: string[];
  /** Whether its models read a PDF directly; the rest get the extracted text. */
  readsPdf: boolean;
}

export const PROVIDERS: Record<ProviderId, Provider> = {
  gemini: {
    label: "Google Gemini",
    keyEnv: ["GEMINI_API_KEY", "API_KEY"],
    models: ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.5-pro"],
    defaultModel: "gemini-flash-latest",
    keyUrl: "https://aistudio.google.com/apikey",
    keyPrefixes: ["AIza", "AQ."], // classic API keys and newer auth keys
    readsPdf: true,
  },
  openai: {
    label: "OpenAI",
    keyEnv: ["OPENAI_API_KEY"],
    models: ["gpt-5-mini", "gpt-5", "gpt-4.1-mini"],
    defaultModel: "gpt-5-mini",
    keyUrl: "https://platform.openai.com/api-keys",
    keyPrefixes: ["sk-"],
    readsPdf: true,
  },
  anthropic: {
    label: "Anthropic Claude",
    keyEnv: ["ANTHROPIC_API_KEY"],
    models: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
    defaultModel: "claude-opus-5",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyPrefixes: ["sk-ant-"],
    readsPdf: true,
  },
  groq: {
    label: "Groq",
    keyEnv: ["GROQ_API_KEY"],
    models: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "moonshotai/kimi-k2-instruct"],
    defaultModel: "llama-3.3-70b-versatile",
    keyUrl: "https://console.groq.com/keys",
    keyPrefixes: ["gsk_"],
    readsPdf: false,
  },
};

const DEFAULT_PROVIDER: ProviderId = "gemini";
const MODEL_RE = /^[A-Za-z0-9._:/-]{1,100}$/;

/** Bad or missing provider / model / key — shown to the user as-is. */
export class LlmConfigError extends Error {}

export interface LlmConfig {
  provider: ProviderId;
  model: string;
  apiKey: string;
  keySource: "user" | "server";
}

const serverKey = (provider: ProviderId) =>
  PROVIDERS[provider].keyEnv.map((name) => process.env[name]).find(Boolean) ?? "";

/** Provider list for the AI settings dialog (no secrets). */
export function describeProviders() {
  return (Object.entries(PROVIDERS) as Array<[ProviderId, Provider]>).map(([id, p]) => ({
    id,
    label: p.label,
    models: p.models,
    default_model: p.defaultModel,
    key_url: p.keyUrl,
    key_prefixes: p.keyPrefixes,
    server_key_available: !!serverKey(id),
  }));
}

export function resolveConfig(provider?: string | null, model?: string | null, apiKey?: string | null): LlmConfig {
  const id = (provider || DEFAULT_PROVIDER).trim().toLowerCase();
  if (!(id in PROVIDERS)) throw new LlmConfigError(`Unknown AI provider '${id}'.`);
  const p = PROVIDERS[id as ProviderId];
  const name = (model || p.defaultModel).trim();
  if (!MODEL_RE.test(name)) throw new LlmConfigError("Model name contains unsupported characters.");
  let key = (apiKey ?? "").trim();
  let keySource: LlmConfig["keySource"] = "user";
  if (!key) [key, keySource] = [serverKey(id as ProviderId), "server"];
  if (!key) throw new LlmConfigError(`No API key for ${p.label}. Add your key in AI settings.`);
  const config = { provider: id as ProviderId, model: name, apiKey: key, keySource };
  // Keep the key out of logs: printing the config shows everything but the key.
  Object.defineProperty(config, "apiKey", { enumerable: false });
  return config;
}

// ── Asking for structured output ──────────────────────────────────────────────

function languageModel(cfg: LlmConfig): LanguageModel {
  switch (cfg.provider) {
    case "gemini":
      return createGoogleGenerativeAI({ apiKey: cfg.apiKey })(cfg.model);
    case "openai":
      return createOpenAI({ apiKey: cfg.apiKey })(cfg.model);
    case "anthropic":
      return createAnthropic({ apiKey: cfg.apiKey })(cfg.model);
    case "groq":
      return createGroq({ apiKey: cfg.apiKey })(cfg.model);
  }
}

/** Sampling settings each provider accepts. */
function callSettings(cfg: LlmConfig, temperature: number) {
  // Current Claude models don't accept sampling parameters, and OpenAI's reasoning
  // models (gpt-5*, o-series) only accept their default temperature.
  if (cfg.provider === "anthropic") return { maxOutputTokens: 16000 };
  if (cfg.provider === "openai" && /^(gpt-5|o\d)/.test(cfg.model)) return {};
  return { temperature };
}

export interface Prompt {
  instructions: string;
  messages: ModelMessage[];
}

/**
 * Send a prompt and get back a validated `schema` object.
 *
 * Gemini, OpenAI and Claude return it through their native structured output.
 * Many Groq models don't support that, so Groq is made to call a "respond" tool
 * whose input is the schema — the same thing LangChain did for us before.
 */
export async function ask<S extends z.ZodType>(
  cfg: LlmConfig,
  schema: S,
  { instructions, messages }: Prompt,
  { temperature = 0, signal }: { temperature?: number; signal?: AbortSignal } = {},
): Promise<z.output<S>> {
  const common = { model: languageModel(cfg), instructions, messages, abortSignal: signal, ...callSettings(cfg, temperature) };
  let raw: unknown;
  try {
    if (cfg.provider === "groq") {
      const result = await generateText({
        ...common,
        tools: { respond: tool({ description: "Respond with your answer.", inputSchema: schema }) },
        toolChoice: { type: "tool", toolName: "respond" },
      });
      raw = result.toolCalls[0]?.input;
    } else {
      const result = await generateText({
        ...common,
        output: Output.object({ schema }),
        // Our schemas have optional fields with defaults, which OpenAI's strict mode rejects.
        providerOptions: { openai: { strictJsonSchema: false } },
      });
      raw = result.output;
    }
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new Error(friendlyError(cfg, err), { cause: err });
  }
  const parsed = schema.safeParse(raw);
  if (raw == null || !parsed.success) {
    throw new Error("The model returned no usable answer. Try again or pick another model.");
  }
  return parsed.data;
}

/** Options for a tailoring run or chat turn. `ask` is swappable so tests can script the model. */
export interface RunOptions {
  signal?: AbortSignal;
  ask?: typeof ask;
}

/** Turn SDK errors into messages a user can act on. */
export function friendlyError(cfg: LlmConfig, err: unknown): string {
  const label = PROVIDERS[cfg.provider].label;
  const cause = RetryError.isInstance(err) ? err.lastError : err;
  const text = cause instanceof Error ? cause.message : String(cause);
  const lowered = text.toLowerCase();
  const status = (cause as { statusCode?: number; status?: number })?.statusCode ?? (cause as { status?: number })?.status;
  if (status === 401 || status === 403 || (lowered.includes("api key") && /invalid|incorrect|not valid/.test(lowered))) {
    return `${label} rejected the API key. Check it in AI settings.`;
  }
  if (status === 404 || (lowered.includes("not found") && lowered.includes("model"))) {
    return `${label} doesn't recognise the model '${cfg.model}' for this key.`;
  }
  if (status === 429 || lowered.includes("rate limit") || lowered.includes("quota")) {
    return `${label} rate limit or quota reached. Wait a moment or check your plan.`;
  }
  return `${label} error: ${text.slice(0, 300)}`;
}

// ── Key check ─────────────────────────────────────────────────────────────────

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function getJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body?.error?.message ?? body?.error ?? detail;
    } catch {
      /* not JSON */
    }
    throw new HttpError(res.status, `${res.status} ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
  return res.json() as Promise<T>;
}

/** Model ids this key can use — doubles as a check that the key works. */
export async function listModels(cfg: LlmConfig): Promise<string[]> {
  let ids: string[] = [];
  try {
    if (cfg.provider === "gemini") {
      let pageToken = "";
      do {
        const page = await getJson<{
          models?: Array<{ name: string; supportedGenerationMethods?: string[] }>;
          nextPageToken?: string;
        }>(
          `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
          { "x-goog-api-key": cfg.apiKey },
        );
        for (const m of page.models ?? []) {
          if (m.supportedGenerationMethods?.includes("generateContent") && m.name.includes("gemini")) {
            ids.push(m.name.replace(/^models\//, ""));
          }
        }
        pageToken = page.nextPageToken ?? "";
      } while (pageToken);
    } else if (cfg.provider === "anthropic") {
      let after = "";
      for (;;) {
        const page = await getJson<{ data: Array<{ id: string }>; has_more?: boolean; last_id?: string }>(
          `https://api.anthropic.com/v1/models?limit=1000${after ? `&after_id=${encodeURIComponent(after)}` : ""}`,
          { "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
        );
        ids.push(...page.data.map((m) => m.id));
        if (!page.has_more || !page.last_id) break;
        after = page.last_id;
      }
    } else if (cfg.provider === "groq") {
      const page = await getJson<{ data: Array<{ id: string }> }>("https://api.groq.com/openai/v1/models", {
        Authorization: `Bearer ${cfg.apiKey}`,
      });
      ids = page.data.map((m) => m.id).filter((i) => !/whisper|tts|guard|playai/.test(i));
    } else {
      const page = await getJson<{ data: Array<{ id: string }> }>("https://api.openai.com/v1/models", {
        Authorization: `Bearer ${cfg.apiKey}`,
      });
      ids = page.data
        .map((m) => m.id)
        .filter((i) => /^(gpt-|o\d|chatgpt)/.test(i) && !/audio|realtime|transcribe|tts|image|search/.test(i));
    }
  } catch (err) {
    throw new Error(friendlyError(cfg, err), { cause: err });
  }
  return [...new Set(ids)].sort();
}
