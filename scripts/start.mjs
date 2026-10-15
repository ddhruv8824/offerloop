#!/usr/bin/env node
// Production (`pnpm start`, and the Docker image's CMD): built platform on $PORT (public),
// microservices on internal ports (reached only through platform proxies).
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { supervise } from "./supervise.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const platform = join(root, "apps", "platform");
const codeRunner = join(root, "services", "code-runner");
const python = process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3");
const port = process.env.PORT ?? "3100";

// In Docker, Python packages are installed system-wide; locally run.py uses its own .venv.
const redlineArgs = [join(root, "services", "redline-api", "run.py"), "--no-reload", ...(process.env.REDLINE_SYSTEM_PYTHON ? ["--system"] : [])];

supervise([
  { name: "redline", color: 35, cmd: python, args: redlineArgs, cwd: root },
  {
    name: "code-runner",
    color: 32,
    cmd: process.execPath,
    args: [join(codeRunner, "dist", "index.js")],
    cwd: codeRunner,
  },
  {
    name: "platform",
    color: 36,
    cmd: process.execPath,
    args: [join(platform, "node_modules", "next", "dist", "bin", "next"), "start", "--port", port, "--hostname", process.env.HOSTNAME ?? "0.0.0.0"],
    cwd: platform,
  },
]);
