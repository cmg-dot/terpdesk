"use client";

import { useId, useState } from "react";
import { setClientName } from "@/app/actions/setClientName";
import { CLIENT_NAME_MAX } from "@/lib/validation/clientName";

interface Props {
  requestId: string;
  /** The name saved on the job (details.deafParticipant); empty when there is none. */
  value: string;
  /** Called with the saved name so the page can keep its copy of the job in step. */
  onSaved: (clientName: string) => void;
}

/**
 * An optional "Client" box at the top of Staffing: the dispatcher types the client's name while booking and saves it right
 * here (Save, or Enter), without opening Edit assignment, which is locked while an offer is out or an interpreter is booked.
 * Agency-only: the name is never shown to interpreters or put in emails. Clearing the box and saving removes the name.
 */
export function ClientNameField({ requestId, value, onSaved }: Props) {
  const [saved, setSaved] = useState(value);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const inputId = useId();
  const dirty = draft.trim() !== saved.trim();

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setMessage(null);
    const result = await setClientName({ requestId, clientName: draft }).catch(() => ({ success: false as const, error: "We could not save the client name. Please try again." }));
    setSaving(false);
    if (!result.success) {
      setMessage({ kind: "error", text: result.error });
      return;
    }
    setSaved(result.clientName);
    setDraft(result.clientName);
    setMessage({ kind: "ok", text: result.clientName === "" ? "Client name removed." : "Client name saved." });
    onSaved(result.clientName);
  };

  return (
    <div data-client-name-field className="mb-6 rounded-xl border border-gray-200 bg-[#FBFAF7] p-4">
      <label htmlFor={inputId} className="block text-sm font-medium text-[var(--ink)]">
        Client <span className="font-normal text-[var(--sage)]">(optional, agency only)</span>
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          id={inputId}
          type="text"
          value={draft}
          maxLength={CLIENT_NAME_MAX}
          autoComplete="off"
          onChange={(event) => { setDraft(event.target.value); setMessage(null); }}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void save(); } }}
          placeholder="Client's name"
          className="min-w-0 flex-1 rounded-full border-none bg-white px-4 py-2.5 text-sm text-gray-800 outline-none ring-1 ring-gray-200 transition-shadow focus:ring-2 focus:ring-[var(--forest)]"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || saving}
          className="rounded-full bg-[#145347] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0f4037] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      <p role="status" aria-live="polite" className={`mt-2 min-h-[1.25rem] text-xs ${message?.kind === "error" ? "text-red-700" : "text-emerald-800"}`}>
        {message?.text ?? ""}
      </p>
    </div>
  );
}
