// The chat assistant, one turn at a time:
//
//   decide        AI   Read the message + conversation, pick an action, draft a reply
//   record_facts  code Save facts the user stated to their master profile
//   review_edits  code Check the proposed edits against the profile (flag, don't block)
//
//   edit            → (record_facts →) review_edits
//   profile_update  → record_facts
//   answer / tailor_request → reply only
//
// Memory: each workspace has one conversation, saved after every turn, so the
// next turn starts with what was said before.

import { randomBytes } from "node:crypto";
import type { ModelMessage } from "ai";
import type { ChatEvent, ChatResult, JdAnalysis, MasterProfile, Resume } from "../lib/tailor/types";
import { ask as askModel, type LlmConfig, type RunOptions } from "./models";
import { applyProfileFacts, factsUserStated } from "./profile";
import * as prompts from "./prompts";
import { ChatDecision, toChanges } from "./schemas";
import * as store from "./store";
import { validateChanges } from "./validation";

/** Conversation messages the model sees (all of them are kept). */
const MAX_HISTORY = 12;

export interface ChatInput {
  workspace: string;
  message: string;
  resume: Resume;
  /** The uploaded resume (bullet-count checks compare against it). */
  original: Resume;
  master: MasterProfile;
  jdAnalysis: JdAnalysis | null;
}

export async function* runChat(
  llm: LlmConfig,
  { workspace, message, resume, original, master, jdAnalysis }: ChatInput,
  { signal, ask = askModel }: RunOptions = {},
): AsyncGenerator<ChatEvent> {
  const log: store.LogStep[] = [];
  const record = (node: string, state: unknown) =>
    log.push({ step: log.length, node, created_at: new Date().toISOString(), state });

  try {
    const memory = await store.loadChat(workspace);
    const conversation: ModelMessage[] = [...memory.messages, { role: "user" as const, content: message }]
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.role, content: m.content }));
    record("input", { message, resume, original, master, jd_analysis: jdAnalysis });

    // decide
    yield { type: "status", stage: "thinking", message: "Working on it…" };
    const decision = await ask(llm, ChatDecision, prompts.chat(resume, master, jdAnalysis, conversation), {
      temperature: 0.2,
      signal,
    });
    record("decide", { decision });

    const result: ChatResult = {
      action: decision.action,
      reply: decision.reply.trim(),
      changes: [],
      rejected: [],
      facts_added: [],
    };

    // record_facts
    let profile = master;
    if ((decision.action === "edit" || decision.action === "profile_update") && decision.profile_facts.length) {
      const [updated, added] = applyProfileFacts(master, factsUserStated(decision.profile_facts, message));
      result.facts_added = added;
      if (added.length) result.master_profile = profile = updated;
      record("record_facts", { facts_added: added, master_updated: added.length ? updated : null });
    }

    // review_edits
    if (decision.action === "edit") {
      const batch = randomBytes(2).toString("hex"); // unique ids, so this turn's edits never clash with earlier ones
      [result.changes, result.rejected] = validateChanges(toChanges(decision), resume, profile, jdAnalysis ?? {}, {
        original,
        idPrefix: `e${batch}_`,
        bulletPrefix: `e${batch}n`,
      });
      record("review_edits", { changes: result.changes, rejected: result.rejected });
    }

    await store.appendChatTurn(
      workspace,
      [
        { role: "user", content: message },
        { role: "assistant", content: decision.reply },
      ],
      log,
    );
    yield { type: "result", ...result };
  } catch (err) {
    if (signal?.aborted) return;
    yield { type: "error", message: (err instanceof Error && err.message) || String(err) };
  }
}
