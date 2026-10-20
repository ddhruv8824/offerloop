// Puts a resume on your Hirist profile. Hirist's Apply sends the resume on your profile (there
// is no per-application upload), so to apply with a job's tailored resume the agent first
// uploads it to your profile, and afterwards puts your main resume back.
//
// Hirist's profile page isn't documented, so the agent learns it once with you watching
// (`npm run resume:setup`): you open the page and click your resume's upload button; the agent
// hands it your main resume (so nothing changes) and remembers the page, the button, any
// confirm button, and which request uploads the file. Later uploads repeat exactly that.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { FileChooser, Page, Request, Response } from "playwright";

export const SETUP_FILE = fileURLToPath(new URL("../../data/hirist-resume.json", import.meta.url));

export type ResumeUploadSetup = {
  /** The Hirist page with your resume's upload button. */
  pageUrl: string;
  /** Text of the button you clicked to upload (opens the file picker). */
  trigger?: string;
  /** The file input that received the file, to find it again without the button. */
  input: { id?: string; name?: string; accept?: string; index: number };
  /** A Save/Upload/Confirm button you had to click after picking the file, if any. */
  confirm?: string;
  /** Path of the request that uploaded the file, with numbers generalised (e.g. /api/user/\d+/resume). */
  uploadPath: string;
  learnedAt: string;
};

export class ResumeUploadError extends Error {}

export async function loadSetup(file = SETUP_FILE): Promise<ResumeUploadSetup | null> {
  try {
    const setup = JSON.parse(await readFile(file, "utf8")) as ResumeUploadSetup;
    return setup.pageUrl && setup.uploadPath ? setup : null;
  } catch {
    return null;
  }
}

export async function saveSetup(setup: ResumeUploadSetup, file = SETUP_FILE): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(setup, null, 2), "utf8");
}

/** A path pattern that matches the same endpoint with different ids. */
export function pathPattern(url: string): string {
  const path = new URL(url).pathname;
  return path
    .split("/")
    .map((part) => (/\d/.test(part) && /^[\w-]+$/.test(part) ? (/^\d+$/.test(part) ? "\\d+" : "[\\w-]+") : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("/");
}

/** Does this request look like a file upload? (sent by the page after a file was picked) */
export function looksLikeUpload(method: string, url: string, contentType: string | undefined): boolean {
  if (!/^(POST|PUT|PATCH)$/i.test(method)) return false;
  if (/multipart\/form-data|application\/pdf|application\/octet-stream/i.test(contentType ?? "")) return true;
  return /resume|\bcv\b|upload|attach|document|file/i.test(new URL(url).pathname);
}

/** Watches the page's requests from now on; resolves with the first upload's response. */
function watchUpload(page: Page, matches: (req: Request) => boolean, timeoutMs: number): { done: Promise<Response | null>; stop: () => void } {
  let stop = () => {};
  const done = new Promise<Response | null>((resolve) => {
    const timer = setTimeout(() => {
      stop();
      resolve(null);
    }, timeoutMs);
    const onRequest = (req: Request) => {
      if (!matches(req)) return;
      stop();
      req.response().then(resolve, () => resolve(null));
    };
    page.on("request", onRequest);
    stop = () => {
      clearTimeout(timer);
      page.off("request", onRequest);
    };
  });
  return { done, stop };
}

const isUpload = (req: Request) => looksLikeUpload(req.method(), req.url(), req.headers()["content-type"]);

/** Remember the text of whatever the person clicks next (button, link or label). */
async function recordClicks(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __olClicked?: string; __olRecording?: boolean };
    w.__olClicked = undefined;
    if (w.__olRecording) return;
    w.__olRecording = true;
    document.addEventListener(
      "click",
      (event) => {
        const el = (event.target as Element | null)?.closest("button, a, label, [role=button]") ?? (event.target as Element | null);
        const text = (el?.textContent ?? "").replace(/\s+/g, " ").trim();
        if (text) w.__olClicked = text.slice(0, 80);
      },
      true,
    );
  });
}
const lastClicked = (page: Page) => page.evaluate(() => (window as unknown as { __olClicked?: string }).__olClicked ?? null).catch(() => null);

/** The file input a chooser belongs to, described so it can be found again. */
async function describeInput(page: Page, chooser: FileChooser): Promise<ResumeUploadSetup["input"]> {
  const el = chooser.element();
  const attrs = await el.evaluate((node) => {
    const input = node as HTMLInputElement;
    const all = Array.from(document.querySelectorAll('input[type="file"]'));
    return { id: input.id || undefined, name: input.name || undefined, accept: input.accept || undefined, index: Math.max(0, all.indexOf(input)) };
  });
  void page;
  return attrs;
}

export type Prompt = (message: string) => Promise<void>;

/**
 * Learn how to upload a resume on Hirist, with the person doing it once in the agent's
 * Chrome. `mainResume` (their own resume) is the file used, so the profile doesn't change.
 */
export async function learnResumeUpload(page: Page, mainResume: string, prompt: Prompt, log: (line: string) => void): Promise<ResumeUploadSetup> {
  await page.bringToFront().catch(() => {});
  await prompt(
    "1. In the agent's Chrome window, open your Hirist profile page — the one that shows your resume and lets you upload a new one.\n" +
      "   Then come back here and press Enter.",
  );
  const pageUrl = page.url();
  if (!/hirist\.tech/.test(pageUrl)) throw new ResumeUploadError(`That tab is on ${pageUrl}, not Hirist. Open your Hirist profile in the same tab and run this again.`);
  log(`   Page: ${pageUrl}`);

  await recordClicks(page);
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 5 * 60_000 });
  chooserPromise.catch(() => {}); // handled below; never an unhandled rejection
  log(
    "\n2. Now click the button you'd use to upload or update your resume on that page.\n" +
      "   No file window will open: the agent picks your main resume for you, so your profile stays the same.",
  );
  let chooser: FileChooser;
  try {
    chooser = await chooserPromise;
  } catch {
    throw new ResumeUploadError("No upload button was clicked within 5 minutes. Run `npm run resume:setup` again.");
  }
  const trigger = (await lastClicked(page)) ?? undefined;
  const input = await describeInput(page, chooser);
  log(`   Upload button: ${trigger ? `“${trigger}”` : "(found the file field)"}`);

  const first = watchUpload(page, isUpload, 10_000);
  await chooser.setFiles(mainResume);
  let response = await first.done;
  let confirm: string | undefined;
  if (!response) {
    await recordClicks(page);
    const second = watchUpload(page, isUpload, 2 * 60_000);
    log("\n3. Hirist didn't upload it yet. If it shows a Save / Upload / Confirm button, click it now.");
    response = await second.done;
    confirm = (await lastClicked(page)) ?? undefined;
    if (confirm) log(`   Confirm button: “${confirm}”`);
  }
  if (!response) throw new ResumeUploadError("Couldn't see Hirist upload the file. Check the page, then run `npm run resume:setup` again.");
  if (!response.ok()) throw new ResumeUploadError(`Hirist answered ${response.status()} to the upload. Check the page, then run setup again.`);

  const setup: ResumeUploadSetup = { pageUrl, trigger, input, confirm, uploadPath: pathPattern(response.url()), learnedAt: new Date().toISOString() };
  log(`   Upload request: ${response.request().method()} ${new URL(response.url()).pathname} → ${response.status()}`);
  return setup;
}

/** Upload `file` as the resume on your Hirist profile, the way setup learned. Throws ResumeUploadError. */
export async function uploadResume(page: Page, setup: ResumeUploadSetup, file: string): Promise<void> {
  try {
    await page.goto(setup.pageUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  } catch (error) {
    throw new ResumeUploadError(`Couldn't open your Hirist profile page (${error instanceof Error ? error.message.split("\n")[0] : error}).`);
  }
  await page.waitForTimeout(2_500); // the profile page fills in after it loads
  if (/\/login|\/registration/.test(new URL(page.url()).pathname)) throw new ResumeUploadError("Hirist isn't logged in (it opened the login page).");

  const endpoint = new RegExp(`^${setup.uploadPath}$`);
  const isSameUpload = (req: Request) => /^(POST|PUT|PATCH)$/i.test(req.method()) && endpoint.test(new URL(req.url()).pathname);
  const watch = watchUpload(page, isSameUpload, 15_000);

  let picked = false;
  // The way you did it: click the same button and hand the file to the picker…
  if (setup.trigger) {
    try {
      // Caught here too, so a wait left over after a failed click can't crash the agent later.
      const chooser = page.waitForEvent("filechooser", { timeout: 10_000 }).catch(() => null);
      await page.getByText(setup.trigger, { exact: true }).filter({ visible: true }).first().click({ timeout: 8_000 });
      const picker = await chooser;
      if (picker) {
        await picker.setFiles(file);
        picked = true;
      }
    } catch {
      /* fall back to the file field */
    }
  }
  // …or straight into the same file field.
  if (!picked) {
    const inputs = page.locator('input[type="file"]');
    const byAttr = setup.input.id ? page.locator(`input[type="file"][id="${setup.input.id}"]`) : setup.input.name ? page.locator(`input[type="file"][name="${setup.input.name}"]`) : null;
    const target = byAttr && (await byAttr.count()) ? byAttr.first() : (await inputs.count()) > setup.input.index ? inputs.nth(setup.input.index) : null;
    if (!target) {
      watch.stop();
      throw new ResumeUploadError("Couldn't find the resume upload on your Hirist profile page (Hirist may have changed it). Run `npm run resume:setup` again.");
    }
    await target.setInputFiles(file);
  }

  let response = await watch.done;
  if (!response && setup.confirm) {
    const again = watchUpload(page, isSameUpload, 20_000);
    await page
      .getByRole("button", { name: setup.confirm, exact: true })
      .or(page.getByText(setup.confirm, { exact: true }))
      .filter({ visible: true })
      .first()
      .click({ timeout: 8_000 })
      .catch(() => {});
    response = await again.done;
  }
  if (!response) throw new ResumeUploadError("Hirist didn't upload the resume (no upload request was seen). Run `npm run resume:setup` again if this keeps happening.");
  if (!response.ok()) throw new ResumeUploadError(`Hirist answered ${response.status()} to the resume upload.`);
  await page.waitForTimeout(1_500);
}
