import { HISTORY_NOTICE } from "@/lib/calendarHistory";

/** A quiet note above an empty stretch of the calendar that lies before the first appointment on file. */
export const CalendarHistoryNotice = () => (
  <p role="note" data-calendar-history-notice className="mt-6 rounded-xl border border-dashed border-gray-200 bg-white/60 px-4 py-3 text-sm text-[var(--sage)]">
    {HISTORY_NOTICE}
  </p>
);
