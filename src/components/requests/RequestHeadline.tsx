import type { RequestWhere } from "@/lib/requestSummary";

interface Props {
  /** "Seattle Children's", "DVR": the headline. Falls back to the job title when the request names no organization. */
  organization: string | null;
  title: string;
  /** "State SRN" with the 9-digit number, or "Reference" with the APT code when the job has no SRN. */
  idLabel: string;
  idValue: string;
  whenText: string;
  where: RequestWhere;
  /** Shown as a small chip when the job repeats. */
  repeatsText?: string | null;
}

/**
 * The top of an appointment: who it is for as the title, then a quick-summary bar with the three things dispatch looks
 * for first: the state SRN, the date and time, and where (or "Virtual · platform").
 */
export const RequestHeadline = ({ organization, title, idLabel, idValue, whenText, where, repeatsText }: Props) => {
  const headline = organization ?? title;
  // The job title is secondary once the organization leads; skip it when it only repeats the SRN ("ODHH SRN #…").
  const showTitle = organization !== null && title.trim() !== "" && title !== organization && !/SRN\s*#/i.test(title);
  return (
    <div>
      <h1 className="text-[28px] font-medium tracking-tight text-[var(--ink)]">{headline}</h1>
      {showTitle && <p className="mt-0.5 text-[14px] text-[var(--sage)]">{title}</p>}
      <dl aria-label="Appointment summary" className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-[auto_auto_1fr]">
        <div>
          <dt className="text-[12px] font-medium uppercase tracking-wide text-[var(--sage)]">{idLabel}</dt>
          <dd data-summary="id" className="font-medium text-[var(--ink)]">{idValue}</dd>
        </div>
        <div>
          <dt className="text-[12px] font-medium uppercase tracking-wide text-[var(--sage)]">Date & time</dt>
          <dd data-summary="when" className="font-medium text-[var(--ink)]">{whenText}</dd>
        </div>
        <div>
          <dt className="text-[12px] font-medium uppercase tracking-wide text-[var(--sage)]">{where.virtual ? "Format" : "Location"}</dt>
          <dd data-summary="where" className="font-medium text-[var(--ink)]">
            {where.text}
            {where.missingAddress && !where.virtual && where.text !== "Location pending" && (
              <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">No street address on file</span>
            )}
          </dd>
        </div>
      </dl>
      {repeatsText && (
        <span className="mt-2 inline-flex items-center rounded-full border border-emerald-200/60 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
          Repeats: {repeatsText}
        </span>
      )}
    </div>
  );
};
