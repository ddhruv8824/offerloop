// Run several processes as one: prefixed output, one Ctrl+C / SIGTERM stops all,
// and if any process exits the rest are stopped too (so a container never runs half-alive).
import { spawn, spawnSync } from "node:child_process";

const windows = process.platform === "win32";

/** @param {{ name: string, color: number, cmd: string, args: string[], cwd: string, shell?: boolean }[]} services */
export function supervise(services) {
  const children = [];
  let stopping = false;

  function stopAll(code = 0) {
    if (stopping) return;
    stopping = true;
    for (const child of children) {
      if (child.exitCode !== null) continue;
      // Kill the whole tree: pnpm, Next.js and run.py all start child processes.
      if (windows) spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      else child.kill("SIGTERM");
    }
    setTimeout(() => process.exit(code), 500);
  }

  for (const svc of services) {
    const tag = `\x1b[${svc.color}m[${svc.name}]\x1b[0m `;
    const child = spawn(svc.cmd, svc.args, { cwd: svc.cwd, shell: svc.shell ?? false, env: process.env });
    const pipe = (stream, out) => {
      let rest = "";
      stream.on("data", (chunk) => {
        const lines = (rest + chunk).split(/\r?\n/);
        rest = lines.pop();
        for (const line of lines) out.write(tag + line + "\n");
      });
    };
    pipe(child.stdout, process.stdout);
    pipe(child.stderr, process.stderr);
    child.on("error", (err) => {
      console.error(`${tag}failed to start: ${err.message}`);
      stopAll(1);
    });
    child.on("exit", (code) => {
      if (!stopping) {
        console.error(`${tag}exited with code ${code} — stopping everything.`);
        stopAll(code ?? 1);
      }
    });
    children.push(child);
  }

  process.on("SIGINT", () => stopAll(0));
  process.on("SIGTERM", () => stopAll(0));
}
