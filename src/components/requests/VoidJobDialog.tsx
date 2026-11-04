"use client";

import { useEffect, useState } from "react";
import { voidRequest } from "@/app/actions/voidRequest";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Dropdown } from "@/components/ui/Dropdown";
import { VOID_KINDS, VOID_LABELS } from "@/lib/voidReasons";
import type { VoidKind } from "@/lib/voidReasons";

const OPTIONS = VOID_KINDS.map((kind) => ({ value: kind, label: VOID_LABELS[kind] }));

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string;
  /** True when someone is booked or an offer is open: the dialog says they will be told in-app (no email). */
  hasInterpreters: boolean;
  /** Called after the job was voided, so the page reloads it. */
  onVoided: () => void;
}

/**
 * "Void job": for a job that should never have existed (the wrong form, a duplicate, voided by the state). Asks why, says
 * plainly what happens (closed like a cancellation, billing cleared, in-app notice only: no email), and confirms.
 */
export function VoidJobDialog({ open, onOpenChange, requestId, hasInterpreters, onVoided }: Props) {
  const [kind, setKind] = useState<VoidKind | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setKind("");
      setNote("");
      setError(null);
    }
  }, [open]);

  const confirm = async () => {
    if (!kind) {
      setError("Choose why this job is being voided.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await voidRequest({ id: requestId, kind, ...(note.trim() ? { note: note.trim() } : {}) }).catch(() => null);
    setBusy(false);
    if (result?.success) {
      onOpenChange(false);
      onVoided();
    } else {
      setError(result && !result.success ? result.error : "We could not void this job. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void this job?</DialogTitle>
          <DialogDescription>
            For a job that should never have existed. It is closed like a cancellation and taken off billing, and the record is kept.
            {hasInterpreters ? " Anyone booked or offered this job is told in the app. No email is sent." : " No email is sent."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label htmlFor="void-reason" className="mb-1 block text-sm font-medium text-gray-800">Reason</label>
            <Dropdown id="void-reason" options={OPTIONS} value={kind} onChange={(value) => setKind(value as VoidKind)} variant="form" placeholder="Choose a reason" ariaLabel="Reason for voiding" invalid={Boolean(error) && !kind} className="w-full" />
          </div>
          <div>
            <label htmlFor="void-note" className="mb-1 block text-sm font-medium text-gray-800">Note (optional, internal)</label>
            <textarea
              id="void-note"
              value={note}
              maxLength={300}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full rounded-2xl border-none bg-[#F4F3EF] px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-[#0B3B32]"
            />
          </div>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => onOpenChange(false)} className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Keep the job
            </button>
            <button type="button" onClick={confirm} disabled={busy} className="rounded-full bg-slate-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
              {busy ? "Voiding…" : "Void job"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
