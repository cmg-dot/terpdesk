"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  deleteShadowFromRoster,
  removeFromAgency,
  setInterpreterActive,
} from "@/app/actions/manageRosterAccess";
import type { RosterActionResult } from "@/app/actions/manageRosterAccess";

export interface ManageAccessTarget {
  id: string;
  name: string;
  email: string;
  isRegistered: boolean;
  isActive: boolean;
}

interface ManageAccessModalProps {
  target: ManageAccessTarget | null;
  onClose: () => void;
  /** Called after a successful change so the roster can refresh. */
  onChanged: (message: string, change: { id: string; removed: boolean; isActive: boolean }) => void;
}

type Pending = "toggle" | "remove" | "delete" | null;

/** Agency-level controls for one interpreter. Never touches the interpreter's global account. */
export const ManageAccessModal = ({ target, onClose, onChanged }: ManageAccessModalProps) => {
  const [pending, setPending] = useState<Pending>(null);
  const [confirming, setConfirming] = useState<"remove" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (pending) return;
    setConfirming(null);
    setError(null);
    onClose();
  };

  const run = async (kind: Exclude<Pending, null>, action: () => Promise<RosterActionResult>, next: { removed: boolean; isActive: boolean }) => {
    if (!target || pending) return;
    setPending(kind);
    setError(null);
    try {
      const result = await action();
      if (result.success) {
        setConfirming(null);
        onChanged(result.message, { id: target.id, ...next });
        onClose();
      } else {
        setError(result.error);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(null);
    }
  };

  const busy = pending !== null;
  const buttonBase = "rounded-full px-5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        {target && (
          <>
            <DialogHeader>
              <DialogTitle>Manage access</DialogTitle>
              <DialogDescription>Changes apply to your agency only. The interpreter&apos;s account is never deleted.</DialogDescription>
            </DialogHeader>

            <dl className="space-y-2 rounded-xl bg-gray-50 p-4 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-gray-500">Name</dt><dd className="font-medium text-gray-900">{target.name}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-gray-500">Email</dt><dd className="truncate font-medium text-gray-900">{target.email}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-gray-500">Account</dt><dd className="font-medium text-gray-900">{target.isRegistered ? "Registered app user" : "Shadow / External"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-gray-500">Roster status</dt><dd className="font-medium text-gray-900">{target.isActive ? "Active" : "Archived (inactive)"}</dd></div>
            </dl>

            <div className="mt-5 space-y-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => run("toggle", () => setInterpreterActive({ interpreterId: target.id, active: !target.isActive }), { removed: false, isActive: !target.isActive })}
                className={`${buttonBase} w-full border border-gray-200 text-gray-800 hover:bg-gray-50`}
              >
                {pending === "toggle" ? "Saving…" : target.isActive ? "Archive / Deactivate" : "Reactivate"}
              </button>
              <p className="text-xs text-gray-500">
                {target.isActive
                  ? "Archived interpreters can't receive job dispatches. Their history and connection are kept."
                  : "Reactivating lets this interpreter receive dispatches again."}
              </p>

              {confirming ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4" role="alertdialog">
                  <p className="text-sm text-red-800">
                    {confirming === "remove"
                      ? `Remove ${target.name} from your agency? They keep their account and any other agencies.`
                      : `Permanently delete ${target.name} from your roster? This can't be undone.`}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        confirming === "remove"
                          ? run("remove", () => removeFromAgency(target.id), { removed: true, isActive: false })
                          : run("delete", () => deleteShadowFromRoster(target.id), { removed: true, isActive: false })
                      }
                      className={`${buttonBase} bg-red-600 text-white hover:bg-red-700`}
                    >
                      {busy ? "Working…" : "Yes, continue"}
                    </button>
                    <button type="button" disabled={busy} onClick={() => setConfirming(null)} className={`${buttonBase} border border-gray-200 text-gray-700 hover:bg-white`}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(target.isRegistered ? "remove" : "delete")}
                  className={`${buttonBase} w-full border border-red-200 text-red-700 hover:bg-red-50`}
                >
                  {target.isRegistered ? "Remove from Agency" : "Delete from Roster"}
                </button>
              )}
            </div>

            {error && (
              <p role="alert" className="mt-4 text-sm font-medium text-red-700">
                {error}
              </p>
            )}

            <DialogFooter>
              <button type="button" disabled={busy} onClick={close} className={`${buttonBase} border border-gray-200 text-gray-700 hover:bg-gray-50`}>
                Close
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
