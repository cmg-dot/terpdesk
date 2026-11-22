"use client";

import { useEffect, useState } from "react";
import { answerQuestion, getOpenQuestions } from "@/app/actions/clarificationReply";
import type { OpenQuestion } from "@/app/actions/clarificationReply";
import { invalidateKey } from "@/lib/clientCache";
import { MAX_ANSWER_LENGTH } from "@/lib/clarificationThread";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string;
  /** The question to answer; null answers the newest open question on the request (an older notice names none). */
  questionId: string | null;
  /** Called after the answer is saved, with the question it answered. */
  onAnswered?: (questionId: string, answer: string) => void;
}

const ASKED = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * "Answer question": the interpreter's question and a reply box, in place (the agency banner, the request page). The answer is
 * saved on the job and shown to that interpreter only; they get a notice and an email that carry no question or answer text.
 */
export function AnswerQuestionDialog({ open, onOpenChange, requestId, questionId, onAnswered }: Props) {
  const [question, setQuestion] = useState<OpenQuestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true);
    setError(null);
    setQuestion(null);
    getOpenQuestions({ requestId, questionId })
      .then((r) => {
        if (!live) return;
        if (!r.success) return setError(r.error);
        if (r.questions.length === 0) return setError("This question was already answered.");
        setQuestion(r.questions[0]);
      })
      .catch(() => live && setError("We could not load the question. Please try again."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [open, requestId, questionId]);

  const submit = async () => {
    if (busy || !question) return;
    if (answer.trim() === "") return setError("Write your answer.");
    setBusy(true);
    setError(null);
    try {
      const result = await answerQuestion({ requestId, questionId: question.id, answer });
      if (!result.success) return setError(result.error);
      // Cached counts of open questions (the dashboard's) are now out of date.
      invalidateKey("dashboard-summary");
      onAnswered?.(question.id, answer.trim());
      setAnswer("");
      onOpenChange(false);
    } catch {
      setError("We could not send your answer. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Answer the question</DialogTitle>
          <DialogDescription>The interpreter sees your answer on the job in terpDESK. Their notice and email never include it.</DialogDescription>
        </DialogHeader>
        {loading && <p className="text-sm text-[var(--sage)]">Loading the question…</p>}
        {question && (
          <figure className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3" data-answer-question={question.id}>
            <blockquote className="whitespace-pre-line text-[15px] text-gray-900">{question.question}</blockquote>
            <figcaption className="mt-1 text-xs text-amber-900">
              {question.interpreterName} · {ASKED.format(new Date(question.askedAt))}
              {question.beforeAccepting ? " · Asked before accepting" : ""}
            </figcaption>
          </figure>
        )}
        {question && (
          <>
            <label htmlFor={`answer-${question.id}`} className="mt-2 block text-sm font-medium text-[var(--ink)]">Your answer</label>
            <textarea
              id={`answer-${question.id}`}
              rows={4}
              maxLength={MAX_ANSWER_LENGTH}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-stone-100 px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-[var(--forest)] focus:ring-2 focus:ring-[rgb(var(--forest-rgb)/0.4)]"
            />
            <p className="mt-1 text-right text-xs text-gray-500">{answer.length}/{MAX_ANSWER_LENGTH}</p>
          </>
        )}
        {error && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{error}</p>}
        <DialogFooter>
          <button type="button" onClick={() => onOpenChange(false)} disabled={busy} className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={busy || !question} className="rounded-full bg-[var(--forest)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--forest-hover)] disabled:opacity-60">
            {busy ? "Sending…" : "Send answer"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
