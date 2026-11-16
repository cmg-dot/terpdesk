"use client";

import { useEffect, useState } from "react";
import { setInterpreterNotes } from "@/app/actions/setInterpreterNotes";
import { INTERPRETER_NOTES_MAX } from "@/lib/interpreterNotes";

interface Props {
  requestId: string;
  /** The notes saved on the job ("" for none). */
  value: string;
  onSaved: (text: string) => void;
}

/**
 * "Booking notes for interpreters" in Staffing: what the booked team needs to know (arrival and departure splits, who takes which
 * half, where to meet). Shown only to interpreters booked on the job, in the app and on the secure job page; saving tells them in
 * the app and by an email that does not contain the notes.
 */
export function InterpreterNotesField({ requestId, value, onSaved }: Props) {
  const [text, setText] = useState(value);
  const [state, setState] = useState<{ busy: boolean; message: string; error: boolean }>({ busy: false, message: "", error: false });
  useEffect(() => setText(value), [value]);

  const save = async () => {
    setState({ busy: true, message: "", error: false });
    const result = await setInterpreterNotes({ requestId, text }).catch(() => null);
    if (result?.success) {
      onSaved(result.text);
      setState({ busy: false, message: result.text ? "Notes saved. Booked interpreters have been told." : "Notes removed.", error: false });
    } else {
      setState({ busy: false, message: result?.error ?? "We could not save the notes. Please try again.", error: true });
    }
  };

  return (
    <div className="mb-6 space-y-2" data-interpreter-notes-field="">
      <label htmlFor={`interpreter-notes-${requestId}`} className="block text-sm font-medium text-[var(--ink)]">
        Booking notes for interpreters <span className="font-normal text-[var(--sage)]">(shown only to booked interpreters)</span>
      </label>
      <textarea
        id={`interpreter-notes-${requestId}`}
        rows={3}
        maxLength={INTERPRETER_NOTES_MAX}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Team split: Position 1 arrives 9:45 and covers the first hour; Position 2 takes over at 11:00."
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[var(--ink)] outline-none focus:ring-2 focus:ring-[rgb(var(--forest-rgb)/0.2)]"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={state.busy || text.trim() === value.trim()}
          className="rounded-full bg-[var(--forest)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--forest-hover)] disabled:opacity-50"
        >
          {state.busy ? "Saving…" : "Save notes"}
        </button>
        {state.message && <span role="status" className={`text-xs ${state.error ? "text-red-700" : "text-[var(--sage)]"}`}>{state.message}</span>}
      </div>
    </div>
  );
}
