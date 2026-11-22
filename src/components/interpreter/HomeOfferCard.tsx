"use client";

import Link from "next/link";
import { ClarificationButton } from "@/components/jobDetails/ClarificationButton";
import { OfferDeclineControl } from "@/components/interpreter/OfferDeclineControl";
import { OfferNotes } from "@/components/interpreter/OfferNotes";
import { OfferSummaryLines } from "@/components/interpreter/OfferSummaryLines";
import { OfferTags } from "@/components/interpreter/OfferTags";
import type { DatedJob } from "@/lib/interpreterJobDate";
import type { PlaceSource } from "@/lib/jobPlaceLines";
import { offerDeadlineLabel } from "@/lib/offerDeadline";

/** What a live offer on the interpreter's Home carries (the server's allowlist, see getInterpreterOffers). */
export type HomeOffer = DatedJob &
  PlaceSource & {
    id: string;
    status: string;
    title?: string | null;
    mentalHealth?: boolean;
    positionCount?: number;
    offerNotes?: string;
    offerNotesRemoved?: boolean;
    offerExpiresAt?: string | null;
  };

interface Props {
  job: HomeOffer;
  /** The Accept button is working on this offer. */
  accepting: boolean;
  onAccept: () => void;
  /** Declines the offer (tells the agency, closes it) and takes the card off the list. Rejects with the server's words when refused. */
  onDecline: (offerId: string) => Promise<void>;
}

/**
 * One live offer on Home: its header, when and where, the tags and the scrubbed notes, the response deadline, and the four things an
 * interpreter can do: ask a question, decline (after one "Decline this offer?" confirmation), review, or accept.
 */
export function HomeOfferCard({ job, accepting, onAccept, onDecline }: Props) {
  const deadline = offerDeadlineLabel(job.offerExpiresAt, job.details?.timeZone ? String(job.details.timeZone) : job.timeZone);
  return (
    <div className="bg-[var(--canvas)] rounded-xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border border-gray-200/50" data-home-offer={job.id}>
      <div className="flex items-start gap-3">
        <div className="w-2 h-2 rounded-full bg-[#9B1C1C] mt-2 shrink-0" />
        <div>
          <h3 className="text-[15px] font-medium text-[var(--ink)] mb-1">Offer received: {job.title}</h3>
          <OfferSummaryLines job={job} />
          {/* Before accepting: mental health, solo or team, and the notes (scrubbed of the client's details on the server). */}
          <OfferTags mentalHealth={job.mentalHealth === true} positionCount={job.positionCount} className="mt-2" />
          <OfferNotes notes={job.offerNotes} removed={job.offerNotesRemoved} compact />
          <p className="text-[12px] text-[var(--sage)] mt-1">
            {deadline ? `Respond by ${deadline} · ` : ""}Pending offers do not reserve time.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 shrink-0 md:w-auto w-full">
        <ClarificationButton target={{ kind: "app", offerId: job.id }} label="Ask a question" compact />
        <OfferDeclineControl offerId={job.id} onDecline={onDecline} />
        <Link
          href={`/jobs/${job.id}`}
          className="text-[13px] font-medium text-gray-700 hover:text-[var(--ink)] bg-white border border-gray-200 rounded-full px-4 py-2 text-center transition-colors flex-1 md:flex-none max-sm:min-h-11"
        >
          Review
        </Link>
        <button
          type="button"
          onClick={onAccept}
          disabled={accepting}
          className="text-[13px] font-medium text-white bg-[var(--forest)] hover:bg-[var(--forest-bright)] disabled:opacity-50 disabled:cursor-not-allowed rounded-full px-4 py-2 text-center transition-colors flex-1 md:flex-none cursor-pointer flex justify-center items-center gap-2 max-sm:min-h-11"
        >
          {accepting ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              Accepting...
            </>
          ) : (
            "Accept"
          )}
        </button>
      </div>
    </div>
  );
}
