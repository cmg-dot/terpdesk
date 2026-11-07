import type { ReactNode } from "react";
import type { RequestWhere } from "@/lib/requestSummary";

interface Props {
  /** "Seattle Children's", "DVR": the headline. Falls back to the job title when the request names no organization. */
  organization: string | null;
  title: string;
  /** The state's 9-digit SRN, shown after the headline as "· #…" (not repeated when the headline already holds it). */
  srn?: string | null;
  /** "State SRN" with the 9-digit number, or "Reference" with the APT code when the job has no SRN. */
  idLabel: string;
  idValue: string;
  whenText: string;
  where: RequestWhere;
  /** Shown as a small chip when the job repeats. */
  repeatsText?: string | null;
  /** Status pills (Happening now, Cancelled, ...) that sit beside the headline. */
  badges?: ReactNode;
}

const LABEL = "text-[12px] font-medium uppercase tracking-wide text-[var(--sage)]";
const VALUE = "mt-0.5 break-words font-medium text-[var(--ink)]";

/**
 * The top of an appointment, full width: who it is for as the title (with its status pills), then one quick-summary bar
 * with the three things dispatch looks for first: the state SRN, the date and time, and where (or "Virtual · platform").
 * The bar gives the location every pixel left over, so a street address reads on one or two lines, not a narrow column;
 * on a phone the three facts stack, and on a small tablet the location takes its own row.
 */
export const RequestHeadline = ({ organization, title, srn, idLabel, idValue, whenText, where, repeatsText, badges }: Props) => {
  const headline = organization ?? title;
  // The job title is secondary once the organization leads; skip it when it only repeats the SRN ("ODHH SRN #…").
  const showTitle = organization !== null && title.trim() !== "" && title !== organization && !/SRN\s*#/i.test(title);
  const srnText = srn?.trim() ?? "";
  const showSrn = srnText !== "" && !headline.includes(srnText);
  return (
    <div className="w-full min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="min-w-0 break-words text-[24px] font-medium leading-tight tracking-tight text-[var(--ink)] sm:text-[28px]">
          {headline}
          {showSrn && <span data-headline-srn className="whitespace-nowrap font-normal text-[var(--sage)]">{" · #"}{srnText}</span>}
        </h1>
        {badges}
      </div>
      {showTitle && <p className="mt-1 text-[14px] text-[var(--sage)]">{title}</p>}
      <dl
        aria-label="Appointment summary"
        className="mt-4 grid grid-cols-1 gap-x-10 gap-y-3 rounded-2xl border border-gray-200 bg-white/70 px-5 py-4 text-sm sm:grid-cols-2 md:grid-cols-[auto_auto_minmax(0,1fr)]"
      >
        <div>
          <dt className={LABEL}>{idLabel}</dt>
          <dd data-summary="id" className={VALUE}>{idValue}</dd>
        </div>
        <div>
          <dt className={LABEL}>Date & time</dt>
          <dd data-summary="when" className={VALUE}>{whenText}</dd>
        </div>
        <div className="min-w-0 sm:col-span-2 md:col-span-1">
          <dt className={LABEL}>{where.virtual ? "Format" : "Location"}</dt>
          <dd data-summary="where" className={VALUE}>
            {where.text}
            {where.missingAddress && !where.virtual && where.text !== "Location pending" && (
              <span className="ml-2 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">No street address on file</span>
            )}
          </dd>
        </div>
      </dl>
      {repeatsText && (
        <span className="mt-3 inline-flex items-center rounded-full border border-emerald-200/60 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
          Repeats: {repeatsText}
        </span>
      )}
    </div>
  );
};
