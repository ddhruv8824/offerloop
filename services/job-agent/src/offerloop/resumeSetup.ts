// `npm run resume:setup` — teach the agent how to change the resume on your Hirist profile,
// so it can apply to each job with the resume Offerloop tailored to it. Run it once, with
// the agent's Chrome open and logged in to Hirist. It uploads your main resume (nothing
// changes on your profile), then checks it can do the same alone.

import { loadEnvFile } from "node:process";
import { createInterface } from "node:readline/promises";
import { ensureHiristAuthenticated } from "../hirist/auth.js";
import { connectToChrome } from "../hirist/browser.js";
import { learnResumeUpload, ResumeUploadError, saveSetup, SETUP_FILE, uploadResume } from "../hirist/profileResume.js";
import { createOfferloopClient } from "./client.js";
import { mainResumeFile, mainResumePath } from "./resumeFiles.js";

try {
  loadEnvFile();
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
}

const url = process.env.OFFERLOOP_URL?.trim();
const key = process.env.OFFERLOOP_AGENT_KEY?.trim();
if (!url || !key) {
  console.error("Set OFFERLOOP_URL and OFFERLOOP_AGENT_KEY in services/job-agent/.env first (see `npm run connect`).");
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const prompt = async (message: string) => void (await rl.question(`\n${message}\n> `));

try {
  console.log("Offerloop: set up tailored resumes on Hirist\n");
  const main = await mainResumeFile(createOfferloopClient(url, key));
  console.log(
    mainResumePath()
      ? `Your main resume: ${main}`
      : `Your main resume: your Resume Studio resume (saved as ${main}).\n` +
          "  Tip: set OFFERLOOP_MAIN_RESUME in .env to your own PDF (e.g. C:\\Users\\you\\Documents\\DhruvCV.pdf) to keep its exact look.",
  );

  const { page } = await connectToChrome({ launch: true });
  await ensureHiristAuthenticated(page);
  const setup = await learnResumeUpload(page, main, prompt, (line) => console.log(line));
  await saveSetup(setup);

  console.log("\nChecking the agent can do it on its own…");
  await uploadResume(page, setup, main);
  console.log(
    `\nDone. Saved to ${SETUP_FILE}.\n` +
      "From now on `npm run connect` (and the background task) puts each job's tailored resume on your\n" +
      "Hirist profile before applying, and your main resume back afterwards.",
  );
  process.exitCode = 0;
} catch (error) {
  console.error(`\n${error instanceof ResumeUploadError ? error.message : error instanceof Error ? error.stack : error}`);
  process.exitCode = 1;
} finally {
  rl.close();
}
process.exit(process.exitCode ?? 0);
