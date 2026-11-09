"use client";

import { useState } from "react";
import { removeMfaDevice } from "@/app/actions/mfaDevices";
import { disableMfa, regenerateRecoveryCodes } from "@/app/actions/mfaManage";
import { startMfaEnrollment } from "@/app/actions/mfaEnrollment";
import { DevicesPanel } from "@/components/settings/mfa/DevicesPanel";
import { EnrollmentDialog } from "@/components/settings/mfa/EnrollmentDialog";
import type { StartedEnrollment } from "@/components/settings/mfa/EnrollmentDialog";
import { RecoveryCodesPanel } from "@/components/settings/mfa/RecoveryCodesPanel";
import { RenameDeviceDialog } from "@/components/settings/mfa/RenameDeviceDialog";
import { StepUpDialog } from "@/components/settings/mfa/StepUpDialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMfaStatus } from "@/hooks/useMfaStatus";
import { defaultDeviceLabel } from "@/lib/mfa/labels";
import type { MfaDeviceInfo } from "@/lib/mfa/types";

const PRIMARY = "rounded-full bg-[var(--forest)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--forest-hover)]";

const SIGN_IN_LOSS = "I understand this authenticator can no longer be used to sign in.";

type Modal = "enroll" | "addStepUp" | "adding" | "regenerate" | "disable" | "removeLast" | null;

/**
 * Settings → Two-step verification (agency staff). Opt-in: nothing happens until someone turns it on. Hidden entirely when the
 * server has MFA_ENABLED=false, and explains itself when the server has no encryption key yet. Two-step is on when the login has at
 * least one confirmed authenticator device; every later device, and every removal, re-confirms with the password and a code first.
 */
export const SecurityCard = () => {
  const { status, failed, refresh } = useMfaStatus();
  const [modal, setModal] = useState<Modal>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [started, setStarted] = useState<StartedEnrollment | null>(null);
  const [renaming, setRenaming] = useState<MfaDeviceInfo | null>(null);
  const [removing, setRemoving] = useState<MfaDeviceInfo | null>(null);

  if (status && !status.featureEnabled) return null;

  const closeAll = () => {
    setModal(null);
    setNewCodes(null);
    setStarted(null);
    setRenaming(null);
    setRemoving(null);
  };
  const doneAndRefresh = () => {
    closeAll();
    void refresh();
  };
  // Removing the only device is turning two-step off, so it goes through the same action (and says so).
  const askRemove = (device: MfaDeviceInfo) => (status && status.devices.length <= 1 ? setModal("removeLast") : setRemoving(device));

  return (
    <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6" data-mfa-card>
      <h2 className="mb-1 text-lg font-semibold text-[var(--ink)]">Two-step verification</h2>
      <p className="mb-5 text-[14px] text-[var(--sage)]">
        Add a second check when you sign in: a 6-digit code from an authenticator app on your phone, as well as your password.
      </p>

      {failed && <p className="text-[13px] text-red-600">Two-step verification could not be loaded. Refresh the page to try again.</p>}
      {!status && !failed && <p className="text-[13px] text-[var(--sage)]">Loading…</p>}
      {status && !status.configured && (
        <p className="text-[13px] text-[var(--sage)]">Two-step verification is not set up on this server yet. Ask your terpDESK administrator to finish setting it up.</p>
      )}
      {status && status.configured && !status.enrolled && (
        <div data-mfa-off>
          <p className="mb-4 text-[13px] text-[var(--sage)]">Off. You sign in with your password only.</p>
          <button type="button" onClick={() => setModal("enroll")} className={PRIMARY}>
            Turn on two-step verification
          </button>
        </div>
      )}
      {status && status.configured && status.enrolled && (
        <DevicesPanel
          status={status}
          onAdd={() => setModal("addStepUp")}
          onRename={setRenaming}
          onRemove={askRemove}
          onRegenerate={() => setModal("regenerate")}
          onDisable={() => setModal("disable")}
        />
      )}

      {/* The first device: no code exists yet to check, so the setup starts by itself. */}
      <EnrollmentDialog open={modal === "enroll"} started={null} defaultLabel={defaultDeviceLabel(0)} onClose={closeAll} onEnrolled={doneAndRefresh} />

      {/* A later device: the password and a code from a device that already works come first; the server checks them before it hands out a QR code. */}
      <StepUpDialog
        open={modal === "addStepUp"}
        title="Add another device"
        description="To add a device, confirm it's you: enter your password and a current code from one of your devices."
        confirmLabel="Continue"
        onClose={closeAll}
        onSubmit={async (password, code) => {
          const result = await startMfaEnrollment({ password, code });
          if (!result.success) return result.error;
          setStarted({ qrDataUrl: result.qrDataUrl, manualKey: result.manualKey });
          setModal("adding");
          return null;
        }}
      />
      <EnrollmentDialog
        open={modal === "adding" && started !== null}
        started={started}
        defaultLabel={defaultDeviceLabel(status?.devices.length ?? 1)}
        onClose={closeAll}
        onEnrolled={doneAndRefresh}
      />

      <RenameDeviceDialog device={renaming} onClose={closeAll} onRenamed={doneAndRefresh} />

      <StepUpDialog
        open={removing !== null}
        title={`Remove “${removing?.label ?? ""}”?`}
        description="Enter your password and a current code to confirm. Your recovery codes are not affected."
        confirmLabel="Confirm removal"
        danger
        acknowledgement={SIGN_IN_LOSS}
        onClose={closeAll}
        onSubmit={async (password, code) => {
          if (!removing) return null;
          const result = await removeMfaDevice({ deviceId: removing.id, password, code });
          if (!result.success) return result.error;
          doneAndRefresh();
          return null;
        }}
      />

      <StepUpDialog
        open={modal === "regenerate" && newCodes === null}
        title="Create new recovery codes"
        description="Your old recovery codes will stop working. Enter your password and a current code to continue."
        confirmLabel="Create new codes"
        onClose={closeAll}
        onSubmit={async (password, code) => {
          const result = await regenerateRecoveryCodes({ password, code });
          if (!result.success) return result.error;
          setNewCodes(result.recoveryCodes);
          return null;
        }}
      />
      <Dialog open={newCodes !== null} onOpenChange={() => undefined}>
        <DialogContent className="max-w-lg" hideClose>
          <DialogHeader>
            <DialogTitle>Your new recovery codes</DialogTitle>
            <DialogDescription>The old codes no longer work.</DialogDescription>
          </DialogHeader>
          {newCodes && <RecoveryCodesPanel codes={newCodes} onDone={doneAndRefresh} />}
        </DialogContent>
      </Dialog>

      <StepUpDialog
        open={modal === "disable" || modal === "removeLast"}
        title={modal === "removeLast" ? "Remove your only device?" : "Turn off two-step verification"}
        description={
          modal === "removeLast"
            ? "This will disable Two-Step Verification on your account. You will sign in with your password only, and your recovery codes will be deleted. Enter your password and a current code to confirm."
            : "You will sign in with your password only, and your recovery codes will be deleted. Enter your password and a current code to confirm."
        }
        confirmLabel={modal === "removeLast" ? "Remove and turn off" : "Turn off"}
        danger
        acknowledgement={modal === "removeLast" ? SIGN_IN_LOSS : undefined}
        onClose={closeAll}
        onSubmit={async (password, code) => {
          const result = await disableMfa({ password, code });
          if (!result.success) return result.error;
          doneAndRefresh();
          return null;
        }}
      />
    </div>
  );
};
