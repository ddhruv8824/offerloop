/** Health check for the host (e.g. Render): answers without the site password. */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true });
}
