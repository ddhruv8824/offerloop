import { Fragment } from "react";
import { ChevronRight } from "lucide-react";
import { ACTION_BY_ID } from "@/lib/workflows";

/** A compact "A › B › C" view of a workflow's steps. */
export function FlowChips({ actionIds }: { actionIds: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      {actionIds.map((id, i) => (
        <Fragment key={`${id}-${i}`}>
          {i > 0 && <ChevronRight className="size-3 text-faint" aria-hidden />}
          <span
            className={
              id === "workflow.approval"
                ? "rounded-sm border border-dashed border-coral px-2 py-0.5 text-coral-strong"
                : "rounded-sm bg-ink/5 px-2 py-0.5 text-text"
            }
          >
            {ACTION_BY_ID[id]?.title ?? id}
          </span>
        </Fragment>
      ))}
    </div>
  );
}
