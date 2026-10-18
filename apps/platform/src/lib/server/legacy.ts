// Server only. Moves the data from before accounts (one shared document) to its owner, once.
//
// Before accounts, everything lived under "automations" (+ "learn-notes/<k>"). Now each person
// has users/<uid>/…, and pay data is shared in "market". The old data goes:
//   one-person install → the local user, on first use;
//   accounts           → the first admin (ADMIN_EMAILS) who signs in — from the old keys, or
//                        from the local user if the site ran as a one-person install meanwhile.
// A marker ("legacy-migrated") records where it went, so it moves exactly once.

import { authMode } from "./auth/config";
import { seal } from "./secret-box";
import { indexSet, platformStorage, type MarketData, type StoreData } from "./store";

const MARKER = "legacy-migrated";
type Marker = { to: string; at: string };

let running: Promise<void> | null = null;

/** Give the old data to `uid`, if nobody has it yet (or only the local user does). */
export function adoptLegacyData(uid: string): Promise<void> {
  const next = (running ?? Promise.resolve()).then(() => migrate(uid));
  running = next.catch((err) => console.error("[legacy] migration failed:", err));
  return running;
}

async function migrate(uid: string): Promise<void> {
  const s = platformStorage();
  const marker = await s.get<Marker>(MARKER);
  if (marker?.to === uid) return;
  if (marker && marker.to !== "local") return; // already someone's
  if (marker?.to === "local" && uid === "local") return;

  // Where it is now: the old shared keys, or the local user's.
  const fromLocal = marker?.to === "local";
  const old = fromLocal ? await s.get<StoreData>("users/local/automations") : await s.get<StoreData & Partial<MarketData>>("automations");
  if (!old) {
    // Nothing to move (a fresh install): remember that, so we never look again.
    if (!marker) await s.set(MARKER, { to: uid, at: new Date().toISOString() } satisfies Marker);
    return;
  }

  // Pay data from postings belongs to everyone.
  if (!fromLocal) {
    const legacy = old as StoreData & Partial<MarketData>;
    const market = (await s.get<MarketData>("market")) ?? { salaryObservations: [], marketScans: {} };
    const byId = new Map(market.salaryObservations.map((o) => [o.jobId, o]));
    for (const o of legacy.salaryObservations ?? []) if (!byId.has(o.jobId)) byId.set(o.jobId, o);
    await s.set("market", { salaryObservations: [...byId.values()], marketScans: { ...(legacy.marketScans ?? {}), ...market.marketScans } });
  }

  const { salaryObservations: _o, marketScans: _m, ...mine } = old as StoreData & Partial<MarketData>;
  // Data from older versions may lack newer fields: start from the defaults.
  const data: StoreData = { workflows: [], runs: [], seenJobs: {}, applyQueue: [], learning: [], approvalLinks: [], ...(mine as Partial<StoreData>) };

  // Signal settings that lived in the environment become this person's own (key encrypted).
  if (!data.signal && authMode() === "accounts" && uid !== "local") {
    const phone = process.env.SIGNAL_PHONE?.trim();
    const apikey = process.env.SIGNAL_CALLMEBOT_KEY?.trim();
    if (phone && apikey) {
      try {
        data.signal = { phone, keyBox: seal(apikey), savedAt: new Date().toISOString() };
      } catch (err) {
        console.warn("[legacy] couldn't move the Signal settings:", err instanceof Error ? err.message : err);
      }
    }
  }

  const target = `users/${uid}/automations`;
  if (!(await s.get(target))) await s.set(target, data);
  // Their PC agent keeps working: the key's index entry now points to them.
  if (data.agent?.keyHash) await indexSet("agent-keys", data.agent.keyHash, { uid });

  // Study notes, and (from the local user) synced browser documents.
  const notesFrom = fromLocal ? "users/local/learn-notes/" : "learn-notes/";
  for (const entry of await s.list(notesFrom)) await s.set(`users/${uid}/learn-notes/${entry.key.split("/").pop()}`, entry.value);
  if (fromLocal) for (const entry of await s.list("users/local/docs/")) await s.set(`users/${uid}/docs/${entry.key.split("/").pop()}`, entry.value);

  await s.set(MARKER, { to: uid, at: new Date().toISOString() } satisfies Marker);
  console.log(`[legacy] moved the data from before accounts to ${uid}${fromLocal ? " (from the local user)" : ""}`);
}
