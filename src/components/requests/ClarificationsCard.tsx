"use client";

import { MessageCircleQuestion } from "lucide-react";

interface Clarification {
  id: string;
  interpreterName?: string;
  question: string;
  askedAt: string;
}

const isClarification = (v: unknown): v is Clarification => {
  const c = v as Partial<Clarification> | null;
  return Boolean(c && typeof c.id === "string" && typeof c.question === "string" && typeof c.askedAt === "string");
};

/**
 * Agency request page: questions booked interpreters sent from their job-details page ("Request clarification"),
 * newest first. Shown only here (never emailed), because a question may mention the client. Hidden when there are none.
 * Rendered at the top of the page in a highlighted callout so staff notice it immediately.
 */
export function ClarificationsCard({ clarifications }: { clarifications: unknown }) {
  const items = (Array.isArray(clarifications) ? clarifications.filter(isClarification) : [])
    .sort((a, b) => new Date(b.askedAt).getTime() - new Date(a.askedAt).getTime())
    .slice(0, 20);
  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="interpreter-questions-heading"
      className="mb-6 rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 shadow-sm sm:p-8 space-y-3"
    >
      <h2 id="interpreter-questions-heading" className="flex items-center gap-2 text-[18px] font-semibold text-amber-950">
        <MessageCircleQuestion className="h-5 w-5 text-amber-700" aria-hidden="true" />
        Questions from interpreters
        <span className="rounded-full bg-amber-600 px-2.5 py-0.5 text-xs font-semibold text-white">{items.length}</span>
      </h2>
      <ul className="divide-y divide-amber-200 rounded-xl border border-amber-200 bg-white px-4">
        {items.map((c) => (
          <li key={c.id} className="py-3">
            <p className="whitespace-pre-line text-[15px] text-gray-800">{c.question}</p>
            <p className="mt-1 text-xs text-[var(--sage)]">
              {c.interpreterName || "Interpreter"} · {new Date(c.askedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-amber-900">Reply to the interpreter directly. If you change the job, they're emailed what changed automatically.</p>
    </section>
  );
}
