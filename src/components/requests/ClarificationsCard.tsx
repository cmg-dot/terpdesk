"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { MessageCircleQuestion } from "lucide-react";
import { AnswerQuestionDialog } from "@/components/requests/AnswerQuestionDialog";
import { isAnswered, readClarifications } from "@/lib/clarificationThread";

const WHEN: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };

/**
 * Agency request page: questions interpreters sent ("Request clarification" once booked, "Ask a question" on a pending offer),
 * newest first, each with "Answer question" until it has an answer (then the answer shows under it). Shown only here (never emailed),
 * because a question may mention the client. Hidden when there are none. A highlighted callout at the top of the page.
 */
export function ClarificationsCard({ clarifications }: { clarifications: unknown }) {
  const params = useParams<{ id?: string }>();
  const requestId = typeof params?.id === "string" ? params.id : "";
  // Answers sent from this card show at once, before the page's data is reloaded.
  const [sent, setSent] = useState<Record<string, { answer: string; at: string }>>({});
  const [answering, setAnswering] = useState<string | null>(null);

  const items = readClarifications(clarifications).slice(0, 20);
  if (items.length === 0) return null;
  const open = items.filter((c) => !isAnswered(c) && !sent[c.id]).length;

  return (
    <section
      id="questions"
      aria-labelledby="interpreter-questions-heading"
      className="mb-6 scroll-mt-24 rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 shadow-sm sm:p-8 space-y-3"
    >
      <h2 id="interpreter-questions-heading" className="flex items-center gap-2 text-[18px] font-semibold text-amber-950">
        <MessageCircleQuestion className="h-5 w-5 text-amber-700" aria-hidden="true" />
        Questions from interpreters
        <span className="rounded-full bg-amber-600 px-2.5 py-0.5 text-xs font-semibold text-white">{open > 0 ? `${open} open` : items.length}</span>
      </h2>
      <ul className="divide-y divide-amber-200 rounded-xl border border-amber-200 bg-white px-4">
        {items.map((c) => {
          const reply = sent[c.id] ?? (isAnswered(c) ? { answer: c.answer ?? "", at: c.answeredAt ?? "" } : null);
          return (
            <li key={c.id} className="py-3" data-question={c.id}>
              <p className="whitespace-pre-line text-[15px] text-gray-800">{c.question}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--sage)]">
                <span>
                  {c.interpreterName || "Interpreter"} · {new Date(c.askedAt).toLocaleString(undefined, WHEN)}
                </span>
                {c.beforeAccepting === true && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900" data-before-accepting="">Asked before accepting</span>
                )}
              </p>
              {reply ? (
                <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2" data-question-answer="">
                  <p className="whitespace-pre-line text-sm text-emerald-950">{reply.answer}</p>
                  <p className="mt-0.5 text-xs text-emerald-800">
                    Answered{c.answeredBy && !sent[c.id] ? ` by ${c.answeredBy}` : ""}
                    {reply.at ? ` · ${new Date(reply.at).toLocaleString(undefined, WHEN)}` : ""}
                  </p>
                </div>
              ) : (
                requestId && (
                  <button
                    type="button"
                    onClick={() => setAnswering(c.id)}
                    data-answer-question-button=""
                    className="mt-2 rounded-full bg-amber-700 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-800"
                  >
                    Answer question
                  </button>
                )
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-amber-900">Your answer reaches only the interpreter who asked. If you change the job, they're emailed what changed automatically.</p>
      {answering && requestId && (
        <AnswerQuestionDialog
          open
          onOpenChange={(next) => !next && setAnswering(null)}
          requestId={requestId}
          questionId={answering}
          onAnswered={(id, answer) => setSent((prev) => ({ ...prev, [id]: { answer, at: new Date().toISOString() } }))}
        />
      )}
    </section>
  );
}
