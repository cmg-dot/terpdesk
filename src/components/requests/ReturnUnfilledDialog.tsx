"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { returnUnfilledJob } from "@/app/actions/returnUnfilledJob";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildOdhhConfirmUrl } from "@/lib/odhhPortal";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string;
  /** A state job (ODHH / HCA): the state keeps its own record, so the job must also be returned in its portal. */
  isStateJob: boolean;
  srn?: string | null;
  /** An offer is waiting for an answer: the dialog says it will be withdrawn and the interpreter told in the app. */
  hasOpenOffer: boolean;
  /** Called after the job was closed, so the page reloads it. */
  onReturned: () => void;
}

/**
 * "Unable to fill": the agency could not staff this job and is returning it to the state or the requester. Says plainly what
 * happens (the job leaves the dashboard, billing is cleared, open offers are withdrawn, the record is kept), links to the job in
 * the state's portal, and, for a state job, will not confirm until staff tick that they returned it there too.
 */
export function ReturnUnfilledDialog({ open, onOpenChange, requestId, isStateJob, srn, hasOpenOffer, onReturned }: Props) {
  const [note, setNote] = useState("");
  const [inPortal, setInPortal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNote("");
      setInPortal(false);
      setError(null);
    }
  }, [open]);

  const blocked = isStateJob && !inPortal;

  const confirm = async () => {
    if (busy || blocked) return;
    setBusy(true);
    setError(null);
    const result = await returnUnfilledJob({ id: requestId, returnedInPortal: inPortal, ...(note.trim() ? { note: note.trim() } : {}) }).catch(() => null);
    setBusy(false);
    if (result?.success) {
      onOpenChange(false);
      onReturned();
    } else {
      setError(result && !result.success ? result.error : "We could not close this job. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark this job unable to fill?</DialogTitle>
          <DialogDescription>
            Use this when you could not staff the job and are returning it. It leaves your dashboard and coverage counts, it is not billed,
            and the record is kept under “Returned”.
            {hasOpenOffer ? " The open offer is withdrawn and the interpreter is told in the app. No email is sent." : " No email is sent."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {isStateJob && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <p>The state keeps its own record of this job, so it also has to be returned in the ODHH portal.</p>
              <a
                href={buildOdhhConfirmUrl(srn)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 font-medium text-[var(--forest)] underline-offset-4 hover:underline"
              >
                Open this job in the ODHH portal <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
              <label className="mt-3 flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={inPortal}
                  onChange={(e) => setInPortal(e.target.checked)}
                  disabled={busy}
                  data-return-portal-check
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--forest)]"
                />
                <span>Returned in ODHH portal. I have returned this job in the state&apos;s portal.</span>
              </label>
            </div>
          )}
          <div>
            <label htmlFor="return-note" className="mb-1 block text-sm font-medium text-gray-800">Note (optional, internal)</label>
            <textarea
              id="return-note"
              value={note}
              maxLength={300}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full rounded-2xl border-none bg-[#F4F3EF] px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-[var(--forest)]"
            />
          </div>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => onOpenChange(false)} disabled={busy} className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Keep the job
            </button>
            <button type="button" onClick={confirm} disabled={busy || blocked} className="rounded-full bg-amber-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50">
              {busy ? "Closing…" : "Mark unable to fill"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
