// Windows notifications for the background agent: nobody watches its (hidden) window, so a
// pop-up says when it applied — or when it's stuck and needs you. Clicking one opens
// Offerloop. Uses Windows' own notification system through Windows PowerShell, so nothing
// extra is installed. Turn them off with OFFERLOOP_NOTIFY=off in .env.

import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { ConnectSummary } from "./connect.js";

export type Notice = { title: string; lines: string[] };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const companies = (items: { company: string }[]) => {
  const names = [...new Set(items.map((i) => i.company))];
  return names.slice(0, 4).join(", ") + (names.length > 4 ? ` +${names.length - 4} more` : "");
};

/** What to say after a pass, or null when there's nothing worth a pop-up (nothing done, dry run). */
export function runNotice(summary: Pick<ConnectSummary, "results" | "stoppedBecause">): Notice | null {
  const of = (...statuses: string[]) => summary.results.filter((r) => statuses.includes(r.status));
  const applied = of("applied");
  const already = of("already_applied");
  const needsYou = of("needs_input");
  const companySite = of("skipped");
  const failed = of("failed");
  if (!applied.length && !already.length && !needsYou.length && !companySite.length && !failed.length && !summary.stoppedBecause) return null;

  const title = applied.length
    ? `Applied to ${plural(applied.length, "Hirist job")}`
    : needsYou.length
      ? `${plural(needsYou.length, "job")} need${needsYou.length === 1 ? "s" : ""} you`
      : summary.stoppedBecause
        ? "Offerloop agent stopped"
        : "Offerloop agent finished";
  const lines: string[] = [];
  if (applied.length) lines.push(`Applied: ${companies(applied)}`);
  if (needsYou.length) lines.push(`Finish on Hirist: ${companies(needsYou)}`);
  if (already.length) lines.push(`Already applied: ${companies(already)}`);
  if (companySite.length) lines.push(`Apply on the company's site: ${companies(companySite)}`);
  if (failed.length) lines.push(`Couldn't apply: ${companies(failed)}`);
  if (summary.stoppedBecause) lines.push(summary.stoppedBecause);
  return { title, lines };
}

// Shown with Windows PowerShell 5.1 (it can reach Windows' notification API; PowerShell 7
// can't). Text arrives in environment variables, so nothing in it is ever run as code.
const TOAST_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$e = { param($s) [Security.SecurityElement]::Escape([string]$s) }
$texts = (@($env:OL_TITLE) + ($env:OL_LINES -split [char]10) | Where-Object { $_ } | Select-Object -First 3 | ForEach-Object { '<text>' + (& $e $_) + '</text>' }) -join ''
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml('<toast activationType="protocol" launch="' + (& $e $env:OL_URL) + '"><visual><binding template="ToastGeneric">' + $texts + '</binding></visual></toast>')
$app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($xml))
`;

const enabled = () => process.platform === "win32" && !/^(off|false|0|no)$/i.test(process.env.OFFERLOOP_NOTIFY?.trim() ?? "");

/** Show a Windows notification. Best effort: a pop-up that fails must never fail the run. */
export function showNotice(notice: Notice, openUrl: string): Promise<void> {
  if (!enabled()) return Promise.resolve();
  // Windows shows a title and two lines; fold anything beyond into the second line.
  const [first = "", ...rest] = notice.lines;
  const lines = [first, rest.join(" · ")].filter(Boolean).join("\n");
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      // -EncodedCommand (UTF-16LE base64) sidesteps Windows command-line quoting entirely.
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(TOAST_SCRIPT, "utf16le").toString("base64")],
      { env: { ...process.env, OL_TITLE: notice.title, OL_LINES: lines, OL_URL: openUrl }, timeout: 15_000, windowsHide: true },
      (error) => {
        if (error) console.warn(`(Couldn't show a Windows notification: ${error.message.split("\n")[0]})`);
        resolve();
      },
    );
  });
}

// The last problem we popped up about, so a logged-out agent says so once — not every 15 minutes.
const PROBLEM_FILE = fileURLToPath(new URL("../../data/notified-problem.txt", import.meta.url));

/** Pop up about a problem, unless it's the same one as last time. */
export async function noticeProblem(problem: string, openUrl: string): Promise<void> {
  const last = await readFile(PROBLEM_FILE, "utf8").catch(() => "");
  if (last.trim() === problem.trim()) return;
  await mkdir(fileURLToPath(new URL("../../data/", import.meta.url)), { recursive: true }).catch(() => {});
  await writeFile(PROBLEM_FILE, problem, "utf8").catch(() => {});
  await showNotice({ title: "Offerloop agent needs you", lines: [problem] }, openUrl);
}

/** Applying works again: the next problem gets a pop-up even if it's the same as before. */
export async function clearProblemNotice(): Promise<void> {
  await rm(PROBLEM_FILE, { force: true }).catch(() => {});
}
