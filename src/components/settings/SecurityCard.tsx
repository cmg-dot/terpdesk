"use client";

import { useState } from "react";
import { disableMfa, regenerateRecoveryCodes } from "@/app/actions/mfaManage";
import { EnrollmentDialog } from "@/components/settings/mfa/EnrollmentDialog";
import { RecoveryCodesPanel } from "@/components/settings/mfa/RecoveryCodesPanel";
import { StepUpDialog } from "@/components/settings/mfa/StepUpDialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMfaStatus } from "@/hooks/useMfaStatus";
import type { MfaStatus } from "@/lib/mfa/types";

const BUTTON = "rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50";
const PRIMARY = "rounded-full bg-[var(--forest)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--forest-hover)]";

const formatDate = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

type Modal = "enroll" | "regenerate" | "disable" | null;

const OnPanel = ({ status, onRegenerate, onDisable }: { status: MfaStatus; onRegenerate: () => void; onDisable: () => void }) => {
  const low = status.recoveryCodesLeft <= 2;
  return (
    <div data-mfa-on>
      <p className="flex items-center gap-2 text-sm font-medium text-[var(--ink)]">
        <span className="h-2 w-2 rounded-full bg-[var(--mint-dot)]" aria-hidden="true" />
        On{status.enrolledAt ? ` since ${formatDate(status.enrolledAt)}` : ""}
      </p>
      <p className={`mt-1 text-[13px] ${low ? "font-medium text-amber-700" : "text-[var(--sage)]"}`}>
        {status.recoveryCodesLeft} of 10 recovery codes left{low ? ". Create new ones soon." : "."}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={onRegenerate} className={BUTTON}>
          Create new recovery codes
        </button>
        <button type="button" onClick={onDisable} className={`${BUTTON} text-red-700`}>
          Turn off
        </button>
      </div>
    </div>
  );
};

/**
 * Settings → Two-step verification (agency staff). Opt-in: nothing happens until someone turns it on. Hidden entirely when the
 * server has MFA_ENABLED=false, and explains itself when the server has no encryption key yet.
 */
export const SecurityCard = () => {
  const { status, failed, refresh } = useMfaStatus();
  const [modal, setModal] = useState<Modal>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  if (status && !status.featureEnabled) return null;

  const closeAll = () => {
    setModal(null);
    setNewCodes(null);
  };

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
        <OnPanel status={status} onRegenerate={() => setModal("regenerate")} onDisable={() => setModal("disable")} />
      )}

      <EnrollmentDialog
        open={modal === "enroll"}
        onClose={closeAll}
        onEnrolled={() => {
          closeAll();
          void refresh();
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
          {newCodes && (
            <RecoveryCodesPanel
              codes={newCodes}
              onDone={() => {
                closeAll();
                void refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <StepUpDialog
        open={modal === "disable"}
        title="Turn off two-step verification"
        description="You will sign in with your password only, and your recovery codes will be deleted. Enter your password and a current code to confirm."
        confirmLabel="Turn off"
        danger
        onClose={closeAll}
        onSubmit={async (password, code) => {
          const result = await disableMfa({ password, code });
          if (!result.success) return result.error;
          closeAll();
          void refresh();
          return null;
        }}
      />
    </div>
  );
};
