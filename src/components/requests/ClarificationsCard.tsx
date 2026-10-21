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
 */
export function ClarificationsCard({ clarifications, cardClass }: { clarifications: unknown; cardClass: string }) {
  const items = (Array.isArray(clarifications) ? clarifications.filter(isClarification) : [])
    .sort((a, b) => new Date(b.askedAt).getTime() - new Date(a.askedAt).getTime())
    .slice(0, 20);
  if (items.length === 0) return null;

  return (
    <div className={cardClass}>
      <h2 className="text-[18px] font-medium text-[var(--ink)] mb-2 flex items-center gap-2">
        <MessageCircleQuestion className="h-5 w-5 text-gray-500" aria-hidden="true" />
        Questions from interpreters ({items.length})
      </h2>
      <ul className="divide-y divide-gray-100">
        {items.map((c) => (
          <li key={c.id} className="py-3">
            <p className="whitespace-pre-line text-[15px] text-gray-800">{c.question}</p>
            <p className="mt-1 text-xs text-[var(--sage)]">
              {c.interpreterName || "Interpreter"} · {new Date(c.askedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-[var(--sage)]">Reply to the interpreter directly. Use “Resend details” if you update the job.</p>
    </div>
  );
}
