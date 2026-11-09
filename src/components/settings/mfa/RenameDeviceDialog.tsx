"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { renameMfaDevice } from "@/app/actions/mfaDevices";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MfaDeviceInfo } from "@/lib/mfa/types";
import { DEVICE_LABEL_MAX } from "@/lib/validation/mfa";

interface RenameDeviceDialogProps {
  /** The device being renamed, or null when the dialog is closed. */
  device: MfaDeviceInfo | null;
  onClose: () => void;
  /** Called after the name was saved. */
  onRenamed: () => void;
}

/** Gives an authenticator device a new name. Not a security change, so it needs no password. */
export const RenameDeviceDialog = ({ device, onClose, onRenamed }: RenameDeviceDialogProps) => {
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setLabel(device?.label ?? "");
    setError(null);
  }, [device]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!device || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await renameMfaDevice({ deviceId: device.id, label });
      if (result.success) onRenamed();
      else setError(result.error);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={device !== null} onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename device</DialogTitle>
          <DialogDescription>Pick a name you will recognise, such as “Work phone”.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate>
          <label htmlFor="mfa-rename-label" className="mb-2 ml-2 block text-[12px] font-medium text-[var(--sage)]">
            Device name
          </label>
          <input
            id="mfa-rename-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={DEVICE_LABEL_MAX}
            autoComplete="off"
            disabled={pending}
            className="w-full rounded-full border-none bg-[#F4F3EF] px-5 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-[var(--forest)]"
          />
          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-xs text-red-700">
              {error}
            </p>
          )}
          <DialogFooter>
            <button type="button" onClick={onClose} disabled={pending} className="w-full rounded-full border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:w-auto">
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || !label.trim()}
              className="w-full rounded-full bg-[var(--forest)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--forest-hover)] disabled:opacity-50 sm:w-auto"
            >
              {pending ? "Saving…" : "Save name"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
