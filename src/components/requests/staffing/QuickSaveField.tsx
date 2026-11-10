"use client";

import { useId, useState } from "react";

export type QuickSaveResult = { success: true; value: string } | { success: false; error: string };

interface Props {
  /** Bold label, and the small grey note after it ("(optional, agency only)"). */
  label: string;
  note: string;
  placeholder: string;
  maxLength: number;
  /** The value saved on the job; empty when there is none. */
  value: string;
  /** The server call (the real check). Resolves to the saved value or an error to show. */
  save: (value: string) => Promise<QuickSaveResult>;
  /** Called with the saved value so the page can keep its copy of the job in step. */
  onSaved: (value: string) => void;
  /** What to say after a save, and after clearing the box. */
  savedText: string;
  clearedText: string;
  /** A data attribute on the box (tests and the page find it by this). */
  dataAttribute: string;
  /** What to say when the call itself fails. */
  failureText: string;
  /** Save as soon as the box loses focus (when something changed), so nothing is lost by tabbing away. Save and Enter still work. */
  saveOnBlur?: boolean;
}

/**
 * A one-line box with a Save button, shown in Staffing: type, then Save (or Enter), without opening Edit assignment (which is
 * locked while an offer is out or an interpreter is booked). Clearing the box and saving removes the value. Used for the client's
 * name and the prior-authorization number, so both behave identically.
 */
export function QuickSaveField({ label, note, placeholder, maxLength, value, save, onSaved, savedText, clearedText, dataAttribute, failureText, saveOnBlur = false }: Props) {
  const [saved, setSaved] = useState(value);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const inputId = useId();
  const dirty = draft.trim() !== saved.trim();

  const submit = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setMessage(null);
    const result = await save(draft).catch((): QuickSaveResult => ({ success: false, error: failureText }));
    setSaving(false);
    if (!result.success) {
      setMessage({ kind: "error", text: result.error });
      return;
    }
    setSaved(result.value);
    setDraft(result.value);
    setMessage({ kind: "ok", text: result.value === "" ? clearedText : savedText });
    onSaved(result.value);
  };

  return (
    <div {...{ [dataAttribute]: "" }} className="rounded-xl border border-gray-200 bg-[#FBFAF7] p-4">
      <label htmlFor={inputId} className="block text-sm font-medium text-[var(--ink)]">
        {label} <span className="font-normal text-[var(--sage)]">{note}</span>
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          id={inputId}
          type="text"
          value={draft}
          maxLength={maxLength}
          autoComplete="off"
          onChange={(event) => { setDraft(event.target.value); setMessage(null); }}
          onBlur={() => { if (saveOnBlur) void submit(); }}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void submit(); } }}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-full border-none bg-white px-4 py-2.5 text-sm text-gray-800 outline-none ring-1 ring-gray-200 transition-shadow focus:ring-2 focus:ring-[var(--forest)]"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!dirty || saving}
          className="rounded-full bg-[var(--forest-bright)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--forest-bright-hover)] disabled:cursor-not-allowed disabled:opacity-50"
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
