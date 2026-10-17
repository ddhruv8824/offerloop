// The recruiter review: a second AI pass reads the drafted edits as a hiring manager would
// and keeps, improves or drops each one, and may add up to 3 edits for must-haves the
// profile backs but the resume still hides. This file only merges that verdict into the
// draft; the honesty checks (validation.ts) run afterwards on the result, so nothing the
// reviewer writes skips them.

import type { TailorReviewSummary } from "../lib/tailor/types";
import type { TailorReview } from "./schemas";
import type { ProposedEdit } from "./validation";

export const MAX_REVIEW_ADDITIONS = 3;

/** Ops whose text the reviewer may reword. Reorders and the skills list are keep-or-drop. */
const REWORDABLE = new Set(["rewrite_bullet", "add_bullet", "rewrite_summary"]);
const ADDABLE = new Set(["rewrite_bullet", "add_bullet"]);

/** What the reviewer is shown: each drafted edit with a short id it can refer to. */
export function draftForReview(edits: ProposedEdit[]) {
  return edits.map((edit, i) => {
    const { op, item_id, bullet_id, before, after, new_order, skills_after, reason } = edit;
    return { id: `d${i + 1}`, op, item_id, bullet_id, before, after, new_order, skills_after, reason };
  });
}

const clean = (s: unknown) => (typeof s === "string" ? s.trim() : "");

/** Apply the reviewer's verdicts to the drafted edits. Unknown or missing verdicts mean keep. */
export function applyReview(drafted: ProposedEdit[], review: TailorReview): { edits: ProposedEdit[]; summary: TailorReviewSummary } {
  const verdicts = new Map(review.verdicts.map((v) => [v.change.trim().toLowerCase(), v]));
  const summary: TailorReviewSummary = { notes: review.notes.map(clean).filter(Boolean).slice(0, 3), kept: 0, improved: 0, dropped: [], added: 0 };
  const edits: ProposedEdit[] = [];

  drafted.forEach((edit, i) => {
    const verdict = verdicts.get(`d${i + 1}`);
    const reason = clean(verdict?.reason);
    if (verdict?.action === "drop") {
      summary.dropped.push({ op: edit.op, before: clean(edit.before) || undefined, after: clean(edit.after) || undefined, reason: reason || "Didn't help for this role." });
      return;
    }
    const better = clean(verdict?.after);
    if (verdict?.action === "improve" && REWORDABLE.has(edit.op) && better && better !== clean(edit.after)) {
      edits.push({ ...edit, after: better, reviewed: "improved", review_note: reason || undefined });
      summary.improved++;
      return;
    }
    edits.push(edit);
    summary.kept++;
  });

  // Extra edits go after the draft, so on a clash the draft's own edit wins the bullet.
  for (const addition of review.additions.slice(0, MAX_REVIEW_ADDITIONS)) {
    if (!ADDABLE.has(addition.op) || !clean(addition.after) || !clean(addition.item_id)) continue;
    edits.push({ ...addition, reviewed: "added", review_note: clean(addition.reason) || undefined });
    summary.added++;
  }
  return { edits, summary };
}
