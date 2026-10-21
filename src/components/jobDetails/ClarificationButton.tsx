"use client";

import { useState } from "react";
import { MessageCircleQuestion } from "lucide-react";
import { requestJobClarification } from "@/app/actions/jobClarification";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const MAX = 500;

/**
 * "Request clarification" on the secure job-details page: a short question for the agency (e.g. "Suite number?").
 * The page's signed link authorizes it; the question is only shown to agency staff inside terpDESK.
 */
export function ClarificationButton({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (question.trim().length < 3) return setError("Please write your question.");
    setBusy(true);
    setError(null);
    try {
      const result = await requestJobClarification({ token, question });
      if (result.success) {
        setSent(true);
        setQuestion("");
        setOpen(false);
      } else {
        setError(result.error);
      }
    } catch {
      setError("We could not send your question. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setSent(false);
          setError(null);
          setOpen(true);
        }}
        className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
      >
        <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" />
        Request clarification
      </button>
      {sent && (
        <p role="status" className="text-sm font-medium text-emerald-700">
          Your question was sent to the agency. They&apos;ll get back to you.
        </p>
      )}

      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ask the agency a question</DialogTitle>
            <DialogDescription>For example: &quot;What is the suite number?&quot; The agency will reply directly.</DialogDescription>
          </DialogHeader>
          <label htmlFor="clarification-question" className="sr-only">Your question</label>
          <textarea
            id="clarification-question"
            rows={4}
            maxLength={MAX}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="w-full rounded-xl border border-stone-200 bg-stone-100 px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-[#0B3B32] focus:ring-2 focus:ring-[#0B3B32]/40"
          />
          <p className="mt-1 text-right text-xs text-gray-500">{question.length}/{MAX}</p>
          {error && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{error}</p>}
          <DialogFooter>
            <button type="button" onClick={() => setOpen(false)} disabled={busy} className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="button" onClick={submit} disabled={busy} className="rounded-full bg-[#0B3B32] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#082a23] disabled:opacity-60">
              {busy ? "Sending…" : "Send question"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
