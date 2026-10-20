// Checks the Hirist profile-resume upload against a fake Hirist profile page in a real
// (headless) Chromium: learning it the way a person would, then repeating it alone.
// Run: npm run connect:test
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { learnResumeUpload, looksLikeUpload, pathPattern, uploadResume } from "./profileResume.js";

function expect(condition: boolean, message: string): void { if (!condition) throw new Error(message); }

// Pure helpers.
expect(new RegExp(`^${pathPattern("https://gladiator.hirist.tech/api/user/123456/resume")}$`).test("/api/user/98/resume"), "ids are generalised");
expect(!new RegExp(`^${pathPattern("https://gladiator.hirist.tech/api/user/123456/resume")}$`).test("/api/user/98/photo"), "other endpoints don't match");
expect(looksLikeUpload("POST", "https://x.tech/api/a", "multipart/form-data; boundary=x"), "multipart is an upload");
expect(looksLikeUpload("PUT", "https://x.tech/api/user/resume", "application/json"), "a resume endpoint is an upload");
expect(!looksLikeUpload("GET", "https://x.tech/api/user/resume", undefined), "GETs aren't");
expect(!looksLikeUpload("POST", "https://x.tech/api/track", "application/json"), "analytics aren't");

const dir = mkdtempSync(join(tmpdir(), "resume-check-"));
const main = join(dir, "Dhruv_CV.pdf");
const tailored = join(dir, "tailored", "Dhruv_CV.pdf");
writeFileSync(main, "%PDF-1.4 main resume");
await import("node:fs/promises").then((fs) => fs.mkdir(join(dir, "tailored")));
writeFileSync(tailored, "%PDF-1.4 tailored for Acme");

/** A fake Hirist profile: "Update Resume" opens a file picker; with `confirm`, a Save button sends it. */
async function fakeHirist(page: Page, { confirm, saveStep = false }: { confirm: boolean; saveStep?: boolean }) {
  const uploads: string[] = [];
  const saves: number[] = [];
  await page.route("https://www.hirist.tech/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<html><body><h1>My profile</h1><p>Resume: <span id="current">old.pdf</span></p>
        <button id="update" onclick="document.getElementById('f').click()">Update Resume</button>
        <input type="file" id="f" accept=".pdf,.doc" style="display:none">
        <div id="dialog" hidden><button id="save">Save</button></div>
        <button id="savenext" onclick="fetch('https://gladiator.hirist.tech/api/profile/personal', { method: 'PUT', body: '{}' })">Save &amp; Next</button>
        <script>
          const send = async () => {
            const file = document.getElementById("f").files[0];
            const fd = new FormData(); fd.append("file", file); fd.append("seen", await file.text()); // the test reads "seen"
            const r = await fetch("https://gladiator.hirist.tech/api/user/5501/resume", { method: "POST", body: fd });
            if (r.ok) document.getElementById("current").textContent = document.getElementById("f").files[0].name;
          };
          document.getElementById("f").addEventListener("change", () => ${confirm ? `document.getElementById("dialog").hidden = false` : "send()"});
          document.getElementById("save").addEventListener("click", send);
          fetch("https://gladiator.hirist.tech/api/track", { method: "POST", body: "{}" }); // noise
        </script></body></html>`,
    }),
  );
  await page.route("https://gladiator.hirist.tech/**", async (route) => {
    const req = route.request();
    if (req.url().endsWith("/resume")) uploads.push(req.postDataBuffer()?.toString("latin1") ?? "");
    if (req.url().endsWith("/personal")) saves.push(Date.now());
    await route.fulfill({ contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } });
  });
  void saveStep;
  return Object.assign(uploads, { saves });
}

// Playwright's own Chromium, else your installed Chrome; skipped if neither can start.
const browser = await chromium
  .launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
  .catch(() => chromium.launch({ channel: "chrome" }))
  .catch(() => null);
if (!browser) {
  console.log("Profile resume upload: browser checks skipped (no headless Chrome available).");
  process.exit(0);
}
for (const [confirm, saveStep] of [[false, false], [true, false], [false, true]] as const) {
  const page = await browser.newPage();
  const uploads = await fakeHirist(page, { confirm, saveStep });
  const logs: string[] = [];
  const profileUrl = saveStep ? "https://www.hirist.tech/registration/addPersonalDetails" : "https://www.hirist.tech/profile";
  let prompts = 0;
  // The person: opens the profile, then clicks "Update Resume" (and Save, when asked; and
  // "Save & Next" at step 3 on a page that needs it).
  const setup = await learnResumeUpload(
    page,
    main,
    async () => {
      if (prompts++ === 0) await page.goto(profileUrl);
      else if (saveStep) {
        await page.click("#savenext");
        await page.waitForTimeout(500);
      }
    },
    (line) => {
      logs.push(line);
      if (line.includes("Now click")) setTimeout(() => void page.click("#update"), 300);
      if (line.includes("Save / Upload / Confirm")) setTimeout(() => void page.click("#save"), 300);
    },
  );
  expect(setup.pageUrl === profileUrl, "remembers the page");
  expect((setup.save === "Save & Next") === saveStep, `remembers the save button only when used (${setup.save})`);
  expect(!saveStep || setup.savePath === "/api/profile/personal", `remembers the save request (${setup.savePath})`);
  expect(setup.trigger === "Update Resume", `remembers the button (${setup.trigger})`);
  expect((setup.confirm === "Save") === confirm, `remembers the confirm button only when needed (${setup.confirm})`);
  expect(new RegExp(`^${setup.uploadPath}$`).test("/api/user/5501/resume"), `remembers the upload request (${setup.uploadPath})`);
  expect(uploads.length === 1 && uploads[0]!.includes("main resume"), "setup uploaded the main resume");

  // Alone: the tailored resume, then the main one back.
  await uploadResume(page, setup, tailored);
  expect(uploads.length === 2 && uploads[1]!.includes("tailored for Acme"), "uploaded the tailored resume");
  await uploadResume(page, setup, main);
  expect(uploads.length === 3 && uploads[2]!.includes("main resume"), "put the main resume back");
  expect(uploads.saves.length === (saveStep ? 3 : 0), `pressed Save & Next after each upload (${uploads.saves.length})`);
  await page.close();
}

// A page that changed (no upload button any more): a clear error, not a hang.
{
  const page = await browser.newPage();
  await page.route("https://www.hirist.tech/**", (route) => route.fulfill({ contentType: "text/html", body: "<h1>Profile</h1>" }));
  let message = "";
  try {
    await uploadResume(page, { pageUrl: "https://www.hirist.tech/profile", trigger: "Update Resume", input: { index: 0 }, uploadPath: "/api/user/\\d+/resume", learnedAt: "" }, tailored);
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  expect(/Couldn't find the resume upload/.test(message), `clear error when the page changed (${message})`);
  await page.close();
}
await browser.close();
console.log("Profile resume upload checks passed.");
