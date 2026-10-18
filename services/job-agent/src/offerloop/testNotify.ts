// `npm run notify:test` — shows a sample Windows pop-up, to check notifications work on this PC.
import { loadEnvFile } from "node:process";
import { showNotice } from "./notify.js";

try {
  loadEnvFile();
} catch {
  // no .env: fine for a test pop-up
}
if (process.platform !== "win32") {
  console.log("Notifications are shown on Windows only.");
} else {
  const site = process.env.OFFERLOOP_URL?.trim().replace(/\/+$/, "") || "https://offerloop.example";
  await showNotice({ title: "Test: applied to 2 Hirist jobs", lines: ["Applied: Example Co, Sample Labs", "Finish on Hirist: Demo Inc"] }, `${site}/automations`);
  console.log("Sent a test notification. Don't see it? Check Windows Settings → System → Notifications (and Focus / Do not disturb).");
}
