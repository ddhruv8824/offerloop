// `npm run connect` — apply to the Hirist jobs you approved on Offerloop, from your own
// logged-in Chrome on this PC, and report each result back to Offerloop.
//
//   npm run connect              one pass through what's approved, then exit
//   npm run connect -- --watch   keep checking every 10 minutes while this window is open
//   npm run connect -- --dry-run find each job's Apply button without clicking it
//   npm run connect -- --scheduled  for Task Scheduler: never waits for a manual login
//                                   (see scripts/run-connect.ps1)
//
// Needs in .env: OFFERLOOP_URL (your site, e.g. https://offerloop-xxxx.onrender.com) and
// OFFERLOOP_AGENT_KEY (Offerloop → Automations → Hirist agent → Connect).
// Opens the agent's Chrome (its own profile, minimized) when there's something to apply to
// and it isn't running yet — see docs/offerloop-agent.md.

import { loadEnvFile } from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { applyToHiristJob } from "../hirist/applyToJob.js";
import { createHiristClient, pageTransport } from "../hirist/api.js";
import { ensureHiristAuthenticated, isHiristAuthenticated, preflightHiristAuthentication } from "../hirist/auth.js";
import { connectToChrome } from "../hirist/browser.js";
import { mapJobDetail } from "../hirist/getJobDetails.js";
import type { Page } from "playwright";
import { createOfferloopClient, OfferloopError } from "./client.js";
import { runConnectOnce } from "./connect.js";

try {
  loadEnvFile();
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
}

const args = new Set(process.argv.slice(2));
const watch = args.has("--watch");
const dryRun = args.has("--dry-run");
// Nobody is watching a scheduled run, so it must not sit waiting for a login.
const scheduled = args.has("--scheduled");
const WATCH_EVERY_MS = 10 * 60_000;

const url = process.env.OFFERLOOP_URL?.trim();
const key = process.env.OFFERLOOP_AGENT_KEY?.trim();
if (!url || !key) {
  console.error(
    "Set OFFERLOOP_URL and OFFERLOOP_AGENT_KEY in services/job-agent/.env first.\n" +
      "Get the key on Offerloop: Automations → Hirist agent → Connect.",
  );
  process.exit(1);
}

let page: Page | undefined;
/** Chrome attached and logged in. The quick check doesn't reload anything; a full check
 *  (opening Hirist, waiting for you to log in by hand) only happens when it fails. */
const ready = async () => {
  if (!page || page.isClosed()) page = (await connectToChrome({ launch: true })).page;
  if (await isHiristAuthenticated(page)) return page;
  if (!scheduled) {
    await ensureHiristAuthenticated(page); // waits for you to log in by hand
  } else if (!(await preflightHiristAuthentication(page))) {
    throw new Error("Not logged in to Hirist. Open the agent's Chrome and log in; approved jobs stay queued until the next run.");
  }
  return page;
};

const offerloop = createOfferloopClient(url, key);
// 45–120 seconds between applications.
const pause = () => sleep(45_000 + Math.floor(Math.random() * 75_000));

async function once() {
  const summary = await runConnectOnce(
    {
      offerloop,
      ensureReady: async () => void (await ready()),
      details: async (job) => {
        const client = createHiristClient(pageTransport(await ready()));
        const raw = await client.jobDetail(job.hiristId, { fresh: true });
        if (!raw) return null;
        return mapJobDetail({ jobId: job.hiristId, title: job.title, company: job.company, location: job.location ?? "", jobUrl: job.url }, raw);
      },
      apply: async (job, dry) => applyToHiristJob(await ready(), job, dry),
      pause,
      log: (line) => console.log(line),
    },
    { dryRun },
  );
  if (summary.done && dryRun) {
    console.log(`\nDry run done: checked ${summary.done} job(s), submitted nothing. They're still queued — run \`npm run connect\` to apply.`);
  } else if (summary.done) {
    const parts = Object.entries(summary.byStatus).map(([status, n]) => `${n} ${status.replace("_", " ")}`);
    console.log(`\nDone: ${parts.join(", ")}. Open Offerloop to see them on your Tracker.`);
  }
  // Nobody may be watching this window, so Offerloop's Automations page shows when the agent
  // is stuck (and clears it once applying works again).
  if (summary.stoppedBecause) await tellOfferloop(summary.stoppedBecause);
  else if (summary.done && !dryRun) await tellOfferloop(null);
  return summary;
}

/** Best effort: a failure to report a problem shouldn't hide the problem itself. */
async function tellOfferloop(problem: string | null) {
  try {
    await offerloop.problem(problem);
  } catch {
    // Offerloop unreachable or older; the log still has it.
  }
}

console.log(
  `Offerloop job agent — ${url}${dryRun ? " (dry run: nothing will be submitted)" : ""}${scheduled ? ` (scheduled run, ${new Date().toLocaleString()})` : ""}`,
);
try {
  for (;;) {
    const summary = await once();
    if (!watch || summary.stoppedBecause) break;
    console.log(`\nChecking again in 10 minutes (Ctrl+C to stop).`);
    await sleep(WATCH_EVERY_MS);
  }
} catch (error) {
  // Expected problems (Chrome not open, Offerloop unreachable, login timed out) print just
  // their message; anything else keeps its stack for debugging.
  const expected = error instanceof OfferloopError || (error instanceof Error && /Chrome|hirist|log ?in|Browser was closed/i.test(error.message));
  if (expected) {
    console.error(`\n${(error as Error).message}`);
    // Can't report "Offerloop unreachable" to Offerloop; everything else (Chrome, Hirist login) we can.
    if (!(error instanceof OfferloopError)) await tellOfferloop((error as Error).message.split("\n")[0]!);
    process.exit(1);
  }
  throw error;
}
process.exit(0);
