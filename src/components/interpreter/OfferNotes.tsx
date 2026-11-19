import { LinkifiedText } from "@/components/ui/LinkifiedText";

/** What a live offer says when the agency's notes were there but everything in them was client detail that the server removed. */
export const NOTES_REMOVED_MESSAGE = "Details were removed to protect the client.";

/**
 * A pending offer's appointment notes, as the server scrubbed them (the client's details are already removed). `removed` is set when
 * the agency wrote notes and none of it was left after the scrub. `compact` is the Home card's short form: three lines at most, and
 * nothing at all when there are no notes.
 */
export function OfferNotes({ notes, removed = false, compact = false }: { notes?: string; removed?: boolean; compact?: boolean }) {
  const text = (notes ?? "").trim();
  if (compact) {
    if (!text && !removed) return null;
    return (
      <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-[13px] leading-snug text-gray-700" data-offer-notes="">
        <span className="font-medium text-[var(--ink)]">Appointment notes: </span>
        {text || NOTES_REMOVED_MESSAGE}
      </p>
    );
  }
  return text ? (
    <p className="whitespace-pre-line text-[14px] leading-relaxed text-gray-700" data-offer-notes="">
      <LinkifiedText text={text} />
    </p>
  ) : (
    <p className="text-[14px] text-[var(--sage)]">{removed ? NOTES_REMOVED_MESSAGE : "The agency has not added notes for this appointment."}</p>
  );
}
