import { outcomeView } from "@/lib/inboxOutcome";
import type { OutcomeTone } from "@/lib/inboxOutcome";

const TONE: Record<OutcomeTone, string> = {
  done: "bg-emerald-50 text-emerald-800 border-emerald-200",
  attention: "bg-red-50 text-red-700 border-red-200",
  quiet: "bg-gray-50 text-gray-500 border-gray-200",
};

/** What the app did about this email ("Job cancelled", "Held: check the job", "Confirm on the job"); nothing for mail it did not act on. */
export function InboxOutcomeChip({ outcome }: { outcome: string | null }) {
  const view = outcomeView(outcome);
  if (!view) return null;
  return (
    <span data-inbox-outcome={outcome} className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE[view.tone]}`}>
      {view.label}
    </span>
  );
}
