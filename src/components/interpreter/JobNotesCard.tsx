"use client";

import { OfferNotes } from "@/components/interpreter/OfferNotes";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";
import { LinkifiedText } from "@/components/ui/LinkifiedText";
import type { Job } from "@/context/InterpreterJobsContext";

interface Props {
  status: Job["status"];
  /** The offer can no longer be answered (its appointment has passed or its deadline has): the notes are not shown. */
  expired: boolean;
  offerNotes?: string;
  offerNotesRemoved?: boolean;
  prepNotes?: string;
}

/**
 * "Appointment notes" on the job page, under one name whatever the stage: a live offer shows the notes scrubbed of the client's
 * details (the server did it), a booking shows them as written, and an expired offer says so instead of claiming there are no notes.
 * Its card id stays "preparation-notes", so a card an interpreter folded earlier stays folded.
 */
export function JobNotesCard({ status, expired, offerNotes, offerNotesRemoved, prepNotes }: Props) {
  return (
    <CollapsibleCard cardId="preparation-notes" title="Appointment notes">
      {status === "pending" && !expired ? (
        <OfferNotes notes={offerNotes} removed={offerNotesRemoved} />
      ) : status === "booked" && prepNotes ? (
        <p className="whitespace-pre-line text-[14px] leading-relaxed text-gray-700">
          <LinkifiedText text={prepNotes} />
        </p>
      ) : (
        <p className="text-[14px] text-[var(--sage)]">
          {expired ? "This offer has expired." : status === "booked" ? "The agency has not added notes for this job." : "No notes for this job."}
        </p>
      )}
    </CollapsibleCard>
  );
}
