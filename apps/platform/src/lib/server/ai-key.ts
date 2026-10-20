// Server only. The AI key automations use to tailor resumes: saved per person, encrypted
// (secret-box.ts), never sent back to the browser. Without one, a server key (GEMINI_API_KEY…)
// is used if the host set one.
import { LlmConfigError, PROVIDERS, resolveConfig, type LlmConfig, type ProviderId } from "@offerloop/resume-studio/server";
import { open } from "./secret-box";
import type { StoreData } from "./store";

export const isProvider = (id: string): id is ProviderId => id in PROVIDERS;

/** The saved provider, model and key, ready to use — or null when there's no usable key. */
export function automationLlm(data: Pick<StoreData, "ai">): LlmConfig | null {
  const saved = data.ai;
  try {
    if (saved) {
      const key = open(saved.keyBox);
      if (key) return resolveConfig(saved.provider, saved.model || null, key);
    }
    return resolveConfig(null, null, null); // the server's own key, if any
  } catch (err) {
    if (err instanceof LlmConfigError) return null;
    throw err;
  }
}

export const maskKey = (key: string) => (key.length <= 8 ? "••••" : `${key.slice(0, 4)}••••${key.slice(-4)}`);
