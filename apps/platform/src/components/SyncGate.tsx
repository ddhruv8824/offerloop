"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { startSync } from "@/lib/sync";

/** Renders its children once this account's synced data is in this browser (see lib/sync.ts). */
export function SyncGate({ accountId, children }: { accountId: string; children: React.ReactNode }) {
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    let live = true;
    void startSync(accountId).finally(() => live && setSynced(true));
    return () => {
      live = false;
    };
  }, [accountId]);
  if (!synced) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Loader2 className="size-5 animate-spin text-muted" aria-label="Loading" />
      </div>
    );
  }
  return children;
}
