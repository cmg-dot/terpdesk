"use client";

import { memo, useCallback, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { updateRequestDetails } from "@/app/actions/updateRequestDetails";
import type { UpdateRequestDetailsResult } from "@/app/actions/updateRequestDetails";
import { MessageRecipientSelect } from "@/components/requests/MessageRecipientSelect";
import { QuickEditLocation } from "@/components/requests/QuickEditLocation";
import { QuickEditSchedule } from "@/components/requests/QuickEditSchedule";
import { Dropdown } from "@/components/ui/Dropdown";
import { SCROLLBAR_CLASS } from "@/components/ui/popoverStyles";
import { plainOptions, withCurrent } from "@/lib/dropdown";
import { initialQuickEditValues, quickEditPayload, quickEditTimesInvalid, requestField } from "@/lib/quickEditAccess";
import type { QuickEditValues } from "@/lib/quickEditAccess";
import { defaultRecipient } from "@/utils/messageRecipients";
import type { MessageRecipient } from "@/utils/messageRecipients";

export type SavedDetails = Extract<UpdateRequestDetailsResult, { success: true }>;

const SETTINGS = plainOptions(["Medical", "Legal", "Educational", "Mental Health", "Social Services", "General"]);
const FORMATS = plainOptions(["Virtual", "In person"]);
const labelClass = "mb-1.5 block text-xs font-semibold text-gray-700";

export interface QuickEditAccessModalProps {
  requestId: string;
  /** The stored request the form starts from (read once, when the modal opens). */
  request: unknown;
  /** An interpreter is booked: date, time and time zone are fixed, and a message to them can be added instead. */
  scheduleLocked: boolean;
  /** An offer is waiting or the appointment has started: nothing can be saved. */
  editLocked: boolean;
  editLockMessage: string;
  recipients: readonly MessageRecipient[];
  /** Runs after the server accepted the change (refresh the page's data here). The modal closes when it finishes. */
  onSaved: (result: SavedDetails, values: QuickEditValues) => Promise<void>;
  onClose: () => void;
}

const sameRecipients = (a: readonly MessageRecipient[], b: readonly MessageRecipient[]): boolean =>
  a === b || (a.length === b.length && a.every((r, i) => r.interpreterId === b[i].interpreterId && r.label === b[i].label));

/** Re-render only when something the modal shows changed: the Request page re-renders constantly (a clock, polling) and must not drag this along. */
const sameProps = (a: QuickEditAccessModalProps, b: QuickEditAccessModalProps): boolean =>
  a.requestId === b.requestId && a.request === b.request && a.scheduleLocked === b.scheduleLocked && a.editLocked === b.editLocked &&
  a.editLockMessage === b.editLockMessage && a.onSaved === b.onSaved && a.onClose === b.onClose && sameRecipients(a.recipients, b.recipients);

const ModalBody = memo(function ModalBody({ requestId, request, scheduleLocked, editLocked, editLockMessage, recipients, onSaved, onClose }: QuickEditAccessModalProps) {
  // The whole form lives here, so a keystroke or a pick re-renders this modal only, never the Request page behind it.
  const [values, setValues] = useState<QuickEditValues>(() => initialQuickEditValues(request));
  const [message, setMessage] = useState("");
  const [recipientId, setRecipientId] = useState(() => defaultRecipient([...recipients], requestField(requestField(request, "data"), "clarifications")));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = useCallback((patch: Partial<QuickEditValues>) => setValues((v) => ({ ...v, ...patch })), []);
  const { startDate, startTime, endDate, endTime, timeZone } = values;
  // Only the five schedule fields matter here, so typing in an address box does not redo the time check.
  const timesInvalid = useMemo(() => quickEditTimesInvalid({ startDate, startTime, endDate, endTime, timeZone }), [startDate, startTime, endDate, endTime, timeZone]);
  const needsRecipient = scheduleLocked && message.trim() !== "" && recipients.length > 1 && !recipientId;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (editLocked) return setError(editLockMessage);
    if (!scheduleLocked && timesInvalid) return;
    setSaving(true);
    setError(null);
    try {
      const result = await updateRequestDetails(quickEditPayload(requestId, values, scheduleLocked, message, recipientId));
      if (!result.success) return setError(result.error);
      await onSaved(result, values);
      onClose();
    } catch (err) {
      console.error("[quick edit] save failed");
      setError(err instanceof Error && err.message ? err.message : "Failed to update details. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    // Drawn on <body> (a transformed or clipped page section cannot move or cut a fixed overlay), and every click inside is
    // kept here: it never reaches a click handler on the Request page behind it.
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={(e) => e.stopPropagation()}>
      <div role="dialog" aria-modal="true" aria-labelledby="quick-edit-title" className="mx-auto flex max-h-[90vh] w-full max-w-[560px] flex-col rounded-2xl border border-gray-200 bg-[#fbfaf6] shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 pb-3 pt-6 sm:px-7 sm:pt-7">
          <div>
            <h3 id="quick-edit-title" className="text-xl font-semibold text-[var(--ink)]">Update Access & Location</h3>
            <p className="mt-0.5 text-xs text-gray-500">Changes will reflect immediately for interpreters and agency staff.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
          {/* The scrolling body: cream track, emerald thumb (SCROLLBAR_CLASS). The padding keeps field focus rings and shadows from being cut at its edges. */}
          <div className={`min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-4 sm:px-7 ${SCROLLBAR_CLASS}`}>
            <QuickEditSchedule values={values} onChange={change} locked={scheduleLocked} startsAt={requestField(request, "startsAt")} endsAt={requestField(request, "endsAt")} timesInvalid={timesInvalid} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="quick-edit-setting" className={labelClass}>Setting</label>
                <Dropdown id="quick-edit-setting" value={values.setting} onChange={(setting) => change({ setting })} options={withCurrent(SETTINGS, values.setting)} className="w-full" />
              </div>
              <div>
                <label htmlFor="quick-edit-format" className={labelClass}>Format</label>
                <Dropdown id="quick-edit-format" value={values.format} onChange={(format) => change({ format })} options={withCurrent(FORMATS, values.format)} className="w-full" />
              </div>
            </div>

            <QuickEditLocation values={values} onChange={change} />

            {scheduleLocked && (
              <div>
                <label htmlFor="quick-edit-interpreter-message" className="mb-1 block text-xs font-medium text-gray-700">Message to interpreter (Optional)</label>
                <textarea
                  id="quick-edit-interpreter-message"
                  rows={3}
                  maxLength={1000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-[#0B3B32]"
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  Added to the “Job details updated” email the booked interpreter gets when you save, e.g. to answer their question, and kept on their job page. It is emailed, so don't include client names or health information. ({message.length}/1000)
                </p>
                {message.trim() && <MessageRecipientSelect id="quick-edit-recipient" className="mt-3" recipients={[...recipients]} value={recipientId} onChange={setRecipientId} />}
              </div>
            )}

            {error && <p className="rounded-lg border border-red-100 bg-red-50 p-2.5 text-xs text-red-600">{error}</p>}
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 sm:px-7">
            <button type="button" onClick={onClose} className="rounded-full border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-white">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || (!scheduleLocked && timesInvalid) || needsRecipient}
              className="rounded-full bg-[var(--forest)] px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--forest)]/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save details"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}, sameProps);

/**
 * The Request page's "Update Access & Location" modal as a component of its own: it holds its own form state, makes its own
 * save call, and is memoised, so typing, picking a date or opening a dropdown re-renders the modal and nothing else. The page
 * hands it plain data and two callbacks (read through refs, so fresh closures on every page render change nothing).
 */
export const QuickEditAccessModal = (props: QuickEditAccessModalProps) => {
  const latest = useRef({ onSaved: props.onSaved, onClose: props.onClose });
  latest.current = { onSaved: props.onSaved, onClose: props.onClose };
  const onSaved = useCallback((result: SavedDetails, values: QuickEditValues) => latest.current.onSaved(result, values), []);
  const onClose = useCallback(() => latest.current.onClose(), []);
  return <ModalBody {...props} onSaved={onSaved} onClose={onClose} />;
};
