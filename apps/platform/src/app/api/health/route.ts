import { storageKind } from "@offerloop/storage";

/**
 * Health check for the host (e.g. Render): answers without the site password.
 * `storage` says where data is saved — "database" means DATABASE_URL is set.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true, storage: storageKind() });
}
