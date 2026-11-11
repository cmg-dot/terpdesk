"use client";

import { useId, useState } from "react";
import { setClientDob } from "@/app/actions/setBillingFields";
import { IconInput } from "@/components/ui/IconInput";
import { todayKey } from "@/lib/dateTimePicker";

interface Props {
  requestId: string;
  /** The date saved on the job (intake.clientDob, yyyy-MM-dd); empty when there is none. */
  value: string;
  /** Called with the saved date (yyyy-MM-dd, or empty) so the page can keep its copy of the job in step. */
  onSaved: (clientDob: string) => void;
}

/** Nobody in the system was born before this; the server refuses anything earlier or in the future (the real check). */
const EARLIEST_DOB = "1900-01-01";

const PICKER_LOOK =
  "w-full rounded-full border-none bg-white px-4 py-2.5 text-sm text-gray-800 outline-none ring-1 ring-gray-200 transition-shadow hover:ring-[rgb(var(--forest-rgb)/0.4)] focus-visible:ring-2 focus-visible:ring-[var(--forest)] disabled:cursor-not-allowed disabled:opacity-60";

/**
 * The "Client date of birth" box next to the client's name in Staffing. The app's own date picker, with a year list so a birth year is two
 * clicks: nothing is typed, so there are no typos. Choosing a date saves it at once (no Save button), without opening Edit assignment, which is
 * locked while an offer is out or an interpreter is booked. "Remove" clears it. For agency billing only: it is never shown to interpreters or
 * put in an email, a link, a notification or a log.
 */
export function ClientDobField({ requestId, value, onSaved }: Props) {
  const [saved, setSaved] = useState(value);
  // What the picker shows: the choice at once, going back to `saved` if the server refuses it.
  const [shown, setShown] = useState(value);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const pickerId = useId();

  const save = async (next: string) => {
    if (saving || next === saved) return;
    setShown(next);
    setSaving(true);
    setMessage(null);
    const result = await setClientDob({ requestId, clientDob: next }).catch(() => ({ success: false as const, error: "We could not save the date of birth. Please try again." }));
    setSaving(false);
    if (!result.success) {
      setShown(saved);
      setMessage({ kind: "error", text: result.error });
      return;
    }
    setSaved(result.clientDob);
    setShown(result.clientDob);
    setMessage({ kind: "ok", text: result.clientDob === "" ? "Client date of birth removed." : "Client date of birth saved." });
    onSaved(result.clientDob);
  };

  return (
    <div data-client-dob-field="" className="rounded-xl border border-gray-200 bg-[#FBFAF7] p-4">
      <label htmlFor={pickerId} className="block text-sm font-medium text-[var(--ink)]">
        Client date of birth <span className="font-normal text-[var(--sage)]">(optional, agency billing only)</span>
      </label>
      <div className="mt-2 flex items-center gap-3">
        <IconInput
          kind="date"
          id={pickerId}
          yearPicker
          value={shown}
          min={EARLIEST_DOB}
          max={todayKey()}
          disabled={saving}
          placeholder="Choose date of birth"
          wrapperClassName="relative min-w-0 flex-1"
          className={PICKER_LOOK}
          onChange={(event) => void save(event.target.value)}
        />
        {saved !== "" && (
          <button
            type="button"
            onClick={() => void save("")}
            disabled={saving}
            className="flex-none rounded-full px-3 py-2 text-sm font-medium text-gray-600 underline-offset-4 transition-colors hover:text-red-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </div>
      <p role="status" aria-live="polite" className={`mt-2 min-h-[1.25rem] text-xs ${message?.kind === "error" ? "text-red-700" : "text-emerald-800"}`}>
        {saving ? "Saving…" : message?.text ?? ""}
      </p>
    </div>
  );
}
