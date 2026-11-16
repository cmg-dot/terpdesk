import { formatInTimeZone } from "date-fns-tz";
import { StickyNote } from "lucide-react";
import { LinkifiedText } from "@/components/ui/LinkifiedText";
import type { InterpreterNotes } from "@/lib/interpreterNotes";

/** The agency's pinned booking notes on a booked interpreter's job page (lib/interpreterNotes.ts). Nothing when there are none. */
export function BookingNotesCard({ notes, timeZone }: { notes: InterpreterNotes | null | undefined; timeZone: string }) {
  if (!notes) return null;
  const at = notes.updatedAt ? new Date(notes.updatedAt) : null;
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-6" data-booking-notes="">
      <h2 className="flex items-center gap-2 text-[16px] font-semibold text-[var(--ink)]">
        <StickyNote className="h-4 w-4 text-amber-700" aria-hidden="true" />
        Booking notes from the agency
      </h2>
      <p className="mt-3 whitespace-pre-line text-[14px] leading-relaxed text-gray-800"><LinkifiedText text={notes.text} /></p>
      {at && !Number.isNaN(at.getTime()) && <p className="mt-3 text-[12px] text-[var(--sage)]">Updated {formatInTimeZone(at, timeZone, "EEE, MMM d · h:mm a zzz")}</p>}
    </div>
  );
}
