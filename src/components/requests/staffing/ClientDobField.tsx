"use client";

import { useId, useState } from "react";
import { setClientDob } from "@/app/actions/setBillingFields";
import { DOB_FORMAT_MESSAGE, formatDob, parseDob } from "@/lib/validation/billingFields";

interface Props {
  requestId: string;
  /** The date saved on the job (intake.clientDob, yyyy-MM-dd); empty when there is none. */
  value: string;
  /** Called with the saved date (yyyy-MM-dd, or empty) so the page can keep its copy of the job in step. */
  onSaved: (clientDob: string) => void;
}

/** What is typed, as MM/DD/YYYY: digits only, the slashes added as you go. A pasted 1985-03-04 is turned round. */
function maskDob(raw: string): string {
  const iso = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(raw);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/**
 * The "Client date of birth" box in Staffing: typed as MM/DD/YYYY with the keyboard (the slashes fill in), saved when you leave the box
 * or press Enter, without opening Edit assignment. A date that is not real, is before 1900 or is in the future is refused right here and
 * again by the server. Clearing the box (or "Remove") removes it. For agency billing only: it is never shown to interpreters or put in
 * an email, a link, a notification or a log.
 */
export function ClientDobField({ requestId, value, onSaved }: Props) {
  const [saved, setSaved] = useState(value);
  const [draft, setDraft] = useState(formatDob(value));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const inputId = useId();

  const save = async (typed: string) => {
    const next = parseDob(typed);
    if (next === null) {
      setMessage({ kind: "error", text: DOB_FORMAT_MESSAGE });
      return;
    }
    if (saving || next === saved) {
      setDraft(formatDob(next));
      return;
    }
    setSaving(true);
    setMessage(null);
    const result = await setClientDob({ requestId, clientDob: next }).catch(() => ({ success: false as const, error: "We could not save the date of birth. Please try again." }));
    setSaving(false);
    if (!result.success) {
      setMessage({ kind: "error", text: result.error });
      return;
    }
    setSaved(result.clientDob);
    setDraft(formatDob(result.clientDob));
    setMessage({ kind: "ok", text: result.clientDob === "" ? "Client date of birth removed." : "Client date of birth saved." });
    onSaved(result.clientDob);
  };

  return (
    <div data-client-dob-field="" className="rounded-xl border border-gray-200 bg-[#FBFAF7] p-4">
      <label htmlFor={inputId} className="block text-sm font-medium text-[var(--ink)]">
        Client date of birth <span className="font-normal text-[var(--sage)]">(MM/DD/YYYY, agency billing only)</span>
      </label>
      <div className="mt-2 flex items-center gap-3">
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="MM/DD/YYYY"
          maxLength={10}
          value={draft}
          disabled={saving}
          aria-invalid={message?.kind === "error"}
          onChange={(event) => { setDraft(maskDob(event.target.value)); setMessage(null); }}
          onBlur={() => void save(draft)}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void save(draft); } }}
          className="min-w-0 flex-1 rounded-full border-none bg-white px-4 py-2.5 text-sm tabular-nums text-gray-800 outline-none ring-1 ring-gray-200 transition-shadow focus:ring-2 focus:ring-[var(--forest)] disabled:cursor-not-allowed disabled:opacity-60"
        />
        {saved !== "" && (
          <button
            type="button"
            onClick={() => { setDraft(""); void save(""); }}
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
