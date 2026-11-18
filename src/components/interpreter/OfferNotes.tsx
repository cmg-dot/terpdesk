import { LinkifiedText } from "@/components/ui/LinkifiedText";

/**
 * A pending offer's appointment notes, as the server scrubbed them (the client's details are already removed). `compact` is the
 * Home card's short form: three lines at most, and nothing at all when there are no notes.
 */
export function OfferNotes({ notes, compact = false }: { notes?: string; compact?: boolean }) {
  const text = (notes ?? "").trim();
  if (compact) {
    if (!text) return null;
    return (
      <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-[13px] leading-snug text-gray-700" data-offer-notes="">
        <span className="font-medium text-[var(--ink)]">Appointment notes: </span>
        {text}
      </p>
    );
  }
  return text ? (
    <p className="whitespace-pre-line text-[14px] leading-relaxed text-gray-700" data-offer-notes="">
      <LinkifiedText text={text} />
    </p>
  ) : (
    <p className="text-[14px] text-[var(--sage)]">The agency has not added notes for this appointment.</p>
  );
}
