import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import { HIRIST_ORIGIN, isHiristUrl } from "./api.js";

const CDP_ENDPOINT = "http://localhost:9222";
/** The agent's own Chrome profile — separate from your everyday Chrome. */
const AGENT_PROFILE = "C:\\hirist-agent-profile";
const CHROME_COMMAND =
  '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" ' +
  '--remote-debugging-port=9222 --user-data-dir="C:\\hirist-agent-profile"';

export type Session = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
};

/** Where Google Chrome is installed on Windows, if it is. */
function findChrome(): string | undefined {
  const roots = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean) as string[];
  return roots.map((root) => join(root, "Google", "Chrome", "Application", "chrome.exe")).find((path) => existsSync(path));
}

const debugPortOpen = async () => {
  try {
    return (await fetch("http://127.0.0.1:9222/json/version", { signal: AbortSignal.timeout(2_000) })).ok;
  } catch {
    return false;
  }
};

/**
 * Opens the agent's Chrome (its own profile, minimized, with the debugging port) and waits
 * until it answers. Windows only; your everyday Chrome is never touched.
 */
async function launchAgentChrome(): Promise<void> {
  const chrome = process.platform === "win32" ? findChrome() : undefined;
  if (!chrome) throw new Error("Could not connect to Chrome on port 9222, and Google Chrome wasn't found to open it.");
  console.log(`Opening the agent's Chrome (${AGENT_PROFILE}), minimized...`);
  spawn(chrome, ["--remote-debugging-port=9222", `--user-data-dir=${AGENT_PROFILE}`, "--no-first-run", "--start-minimized"], {
    detached: true,
    stdio: "ignore",
  }).unref(); // keeps running after the agent exits, so the Hirist login stays warm
  for (let waited = 0; waited < 45_000; waited += 1_500) {
    await sleep(1_500);
    if (await debugPortOpen()) return;
  }
  throw new Error(
    "Opened the agent's Chrome, but it didn't open port 9222. If a Chrome window with the agent profile " +
      "is already open without it, close that window; the next run reopens it properly.",
  );
}

/**
 * Attaches to the agent's dedicated Chrome. With `launch`, opens it first if it isn't running
 * (Windows). It never uses your normal Chrome profile.
 */
export async function connectToChrome({ launch = false }: { launch?: boolean } = {}): Promise<Session> {
  let browser: Browser;

  if (launch && !(await debugPortOpen())) await launchAgentChrome();
  try {
    browser = await chromium.connectOverCDP(CDP_ENDPOINT, { timeout: 10_000 });
  } catch {
    throw new Error(
      "Could not connect to Chrome on port 9222.\n\n" +
        "Start Chrome with remote debugging enabled:\n\n" +
        CHROME_COMMAND +
        "\n\nFrom Git Bash:\n\n" +
        '"/c/Program Files/Google/Chrome/Application/chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\\hirist-agent-profile" &'
    );
  }

  const contexts = browser.contexts();
  const context = contexts[0];
  if (!context) {
    throw new Error("No Chrome browser context found");
  }

  const pages = context.pages();
  const page =
    pages.find((candidate) => isHiristUrl(candidate.url())) ??
    (await context.newPage());

  return { browser, context, page };
}

/** Opens the Hirist home page, with a clearer error if the site is unreachable. */
export async function openHirist(page: Page): Promise<void> {
  try {
    await page.goto(`${HIRIST_ORIGIN}/`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
  } catch (error) {
    throw new Error(
      "Could not load hirist.tech - check your internet connection. " +
        `(${error instanceof Error ? error.message : error})`
    );
  }
}
