// Next.js calls register() once when the server starts (dev and production).
// It starts the automations scheduler in the Node.js server process only.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startScheduler } = await import("./lib/server/automations/scheduler");
  startScheduler();
}
