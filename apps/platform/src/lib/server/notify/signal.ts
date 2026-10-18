// Server only. Signal messages through CallMeBot's free Signal relay (personal use): you
// message their bot once to get an API key, then the server can text you.
//
//   SIGNAL_PHONE           the "phone" value in the URL CallMeBot's bot sent you — often an ID
//                          like c242bb7d-…, otherwise your number, e.g. +919812345678
//   SIGNAL_CALLMEBOT_KEY   the API key the bot sent you
//
// One-way only, and CallMeBot can read what passes through it — so messages carry job titles
// and a link, never keys or passwords. Unset either variable and nothing is sent.

import { updateStore } from "../store";

// The address CallMeBot's bot gives you when it sends your key. SIGNAL_CALLMEBOT_URL overrides
// it, should CallMeBot move it again.
const endpoint = () => process.env.SIGNAL_CALLMEBOT_URL?.trim() || "https://signal.callmebot.com/signal/send.php";
const MAX_CHARS = 1500;

export function signalConfigured(): boolean {
  return Boolean(process.env.SIGNAL_PHONE?.trim() && process.env.SIGNAL_CALLMEBOT_KEY?.trim());
}

/** Send one message. Throws with a readable reason when it can't; returns CallMeBot's reply. */
export async function sendSignal(text: string): Promise<string> {
  const phone = process.env.SIGNAL_PHONE?.trim();
  const apikey = process.env.SIGNAL_CALLMEBOT_KEY?.trim();
  if (!phone || !apikey) throw new Error("Signal isn't set up: add SIGNAL_PHONE and SIGNAL_CALLMEBOT_KEY on the server.");
  const url = `${endpoint()}?${new URLSearchParams({ phone, apikey, text: text.slice(0, MAX_CHARS) })}`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
  } catch (err) {
    throw new Error(`Couldn't reach CallMeBot (${err instanceof Error ? err.message : err}).`);
  }
  const body = await res.text().catch(() => "");
  // CallMeBot answers with a short HTML page; a wrong key or number still comes back as text.
  // Never keep the key or the account id in what we show or store.
  const reply = body
    .replace(/<[^>]+>/g, " ")
    .split(apikey)
    .join("•••")
    .split(phone)
    .join("•••")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  if (!res.ok || /invalid|error|not (?:found|allowed|registered|activated)/i.test(reply)) {
    throw new Error(`CallMeBot didn't send it (${res.status}${reply ? `: ${reply}` : ""}).`);
  }
  return reply;
}

export interface SignalResult {
  ok: boolean;
  at: string;
  kind: "test" | "approval";
  /** CallMeBot's reply, or why it failed (key and id removed). */
  detail: string;
}

/** Send, and remember how it went so the Automations page can show it. Never throws. */
export async function sendAndRecord(kind: SignalResult["kind"], text: string): Promise<SignalResult> {
  let result: SignalResult;
  try {
    result = { ok: true, at: new Date().toISOString(), kind, detail: (await sendSignal(text)) || "Sent." };
  } catch (err) {
    result = { ok: false, at: new Date().toISOString(), kind, detail: err instanceof Error ? err.message : String(err) };
    console.warn("[signal]", result.detail);
  }
  await updateStore((d) => {
    d.signalLast = result;
  }).catch(() => {});
  return result;
}

/** Best effort: a failed message is recorded and logged, never fails what triggered it. */
export async function trySendSignal(text: string, kind: SignalResult["kind"] = "approval"): Promise<void> {
  if (!signalConfigured()) return;
  await sendAndRecord(kind, text);
}
