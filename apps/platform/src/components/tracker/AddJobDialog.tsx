"use client";

import { useState, type FormEvent } from "react";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/ui";
import { addCard, STATUS_LABEL } from "@/lib/tracker";
import { STATUS_ORDER, type ApplicationStatus } from "@/lib/types";

const input = "mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink";

/** Track a job from anywhere: LinkedIn, Naukri, a referral, a company site. */
export function AddJobDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<ApplicationStatus>("applied");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !company.trim()) return;
    addCard({ title, company, url, status });
    setTitle("");
    setCompany("");
    setUrl("");
    setStatus("applied");
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title="Track a job">
      <form onSubmit={submit} className="space-y-4 p-5">
        <label className="block text-sm font-semibold">
          Role
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Frontend Developer" required autoFocus />
        </label>
        <label className="block text-sm font-semibold">
          Company
          <input className={input} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Northwind Pay" required />
          <span className="mt-1 block text-xs font-normal text-muted">Use the name the company signs its emails with — that's how inbox updates find this card.</span>
        </label>
        <label className="block text-sm font-semibold">
          Link <span className="font-normal text-muted">(optional)</span>
          <input className={input} type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </label>
        <label className="block text-sm font-semibold">
          Where is it now?
          <select className={input} value={status} onChange={(e) => setStatus(e.target.value as ApplicationStatus)}>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Add to tracker</Button>
        </div>
      </form>
    </Dialog>
  );
}
