"use client";

import { useState } from "react";
import { Undo2 } from "lucide-react";
import { giveBackViaDetailsLink } from "@/app/actions/giveBackAssignment";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const MAX = 1000;

/**
 * "Give back assignment" on the secure job-details page, mirroring the app. Only offered before the appointment starts
 * (the server checks again). The agency is notified; the reason is shown to staff only.
 */
export function GiveBackButton({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await giveBackViaDetailsLink({ token, reason });
      if (result.success) {
        setDone(true);
        setOpen(false);
      } else {
        setError(result.error);
      }
    } catch {
      setError("We could not give back this assignment. Please try again or contact the agency.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <p role="status" className="text-sm font-medium text-emerald-700">
        You gave back this assignment. The agency has been notified and will find a replacement.
      </p>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-5 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50"
      >
        <Undo2 className="h-4 w-4" aria-hidden="true" />
        Give back assignment
      </button>

      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Give back this assignment?</DialogTitle>
            <DialogDescription>
              You will no longer be booked, and the agency will look for a replacement. This can&apos;t be undone from here.
            </DialogDescription>
          </DialogHeader>
          <label htmlFor="give-back-reason" className="mb-1 block text-sm text-gray-700">Reason (optional, shared with the agency only)</label>
          <textarea
            id="give-back-reason"
            rows={3}
            maxLength={MAX}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-xl border border-stone-200 bg-stone-100 px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-[#0B3B32] focus:ring-2 focus:ring-[#0B3B32]/40"
          />
          {error && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{error}</p>}
          <DialogFooter>
            <button type="button" onClick={() => setOpen(false)} disabled={busy} className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Keep assignment
            </button>
            <button type="button" onClick={submit} disabled={busy} className="rounded-full bg-red-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60">
              {busy ? "Giving back…" : "Give back"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
