// Server only. Signal messages through CallMeBot's free Signal relay (personal use): each
// person messages CallMeBot's bot once to get an API key, saves it on the Automations page,
// and the server can text them.
//
// Saved per person (StoreData.signal): the "phone" value from the link the bot sends (often
// an id like c242bb7d-…, otherwise a number like +919812345678) and the API key (encrypted).
// On a one-person install, SIGNAL_PHONE and SIGNAL_CALLMEBOT_KEY in the environment also work.
//
// One-way only, and CallMeBot can read what passes through it — so messages carry job titles
// and links, never keys or passwords.

import { authMode } from "../auth/config";
import { open } from "../secret-box";
import { updateStore, type StoreData } from "../store";

// The address CallMeBot's bot gives you with your key. SIGNAL_CALLMEBOT_URL overrides it,
// should CallMeBot move it again.
const endpoint = () => process.env.SIGNAL_CALLMEBOT_URL?.trim() || "https://signal.callmebot.com/signal/send.php";
const MAX_CHARS = 1500;

export interface SignalCreds {
  phone: string;
  apikey: string;
}

/** This person's Signal settings, or null when they haven't set them up. */
export function signalCreds(data: Pick<StoreData, "signal">): SignalCreds | null {
  if (data.signal) {
    const apikey = open(data.signal.keyBox);
    if (apikey) return { phone: data.signal.phone, apikey };
  }
  if (authMode() === "single") {
    const phone = process.env.SIGNAL_PHONE?.trim();
    const apikey = process.env.SIGNAL_CALLMEBOT_KEY?.trim();
    if (phone && apikey) return { phone, apikey };
  }
  return null;
}

/** Send one message. Throws with a readable reason when it can't; returns CallMeBot's reply. */
export async function sendSignal({ phone, apikey }: SignalCreds, text: string): Promise<string> {
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
  if (!res.ok || /invalid|error|not (?:found|allowed|registered|activated)|not sent/i.test(reply)) {
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
export async function sendAndRecord(uid: string, creds: SignalCreds, kind: SignalResult["kind"], text: string): Promise<SignalResult> {
  let result: SignalResult;
  try {
    result = { ok: true, at: new Date().toISOString(), kind, detail: (await sendSignal(creds, text)) || "Sent." };
  } catch (err) {
    result = { ok: false, at: new Date().toISOString(), kind, detail: err instanceof Error ? err.message : String(err) };
    console.warn("[signal]", result.detail);
  }
  await updateStore(uid, (d) => {
    d.signalLast = result;
  }).catch(() => {});
  return result;
}
