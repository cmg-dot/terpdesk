import { MailOpen } from "lucide-react";

/** The reading pane before anything is selected: a soft emerald illustration, a title and one line of help. */
export function InboxEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center" data-inbox-empty="none-selected">
      <div className="relative flex h-28 w-28 items-center justify-center" aria-hidden="true">
        <span className="absolute inset-0 rounded-full bg-emerald-50" />
        <span className="absolute -right-1 top-2 h-5 w-5 rounded-full bg-emerald-100" />
        <span className="absolute -left-2 bottom-4 h-3 w-3 rounded-full bg-amber-100" />
        <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-emerald-100">
          <MailOpen className="h-8 w-8 text-[var(--forest)]" strokeWidth={1.5} />
        </span>
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-[var(--ink)]">No message selected</h2>
        <p className="mx-auto max-w-xs text-sm leading-relaxed text-[var(--sage)]">Select an email from the left to view parsed intake data and raw content.</p>
      </div>
    </div>
  );
}
