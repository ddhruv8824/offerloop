#!/usr/bin/env node
// `pnpm dev`: platform (:3100) and backend microservices together.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { supervise } from "./supervise.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const windows = process.platform === "win32";
const python = process.env.PYTHON ?? (windows ? "python" : "python3");
const pnpmJs = process.env.npm_execpath; // set by `pnpm dev`

const pnpmRun = (filter, script = "dev") => (
  /\.c?js$/.test(pnpmJs ?? "")
    ? { cmd: process.execPath, args: [pnpmJs, "--filter", filter, script] }
    : { cmd: "pnpm", args: ["--filter", filter, script], shell: windows }
);

const services = [
  // Redline API (internal :8100)
  { name: "redline", color: 35, cmd: python, args: [join(root, "services", "redline-api", "run.py")], cwd: root },
  // Code runner API (internal :8001)
  { name: "code-runner", color: 32, ...pnpmRun("@offerloop/code-runner"), cwd: root },
  // Next.js Platform (public gateway :3100)
  { name: "platform", color: 36, ...pnpmRun("@offerloop/platform"), cwd: root },
];

supervise(services);
