interface DetailsUpdate {
  at: string;
  fields: string[];
}

const whenLabel = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

/**
 * "Updated" pill on an interpreter's booked job card: the agency changed the job after they accepted.
 * Hidden once the appointment has ended (edits are locked from the start time on, so it would only be noise).
 */
export function UpdatedBadge({ update, endsAt, className = "" }: { update?: DetailsUpdate | null; endsAt?: string; className?: string }) {
  if (!update) return null;
  const endMs = endsAt ? new Date(endsAt).getTime() : Number.NaN;
  if (!Number.isNaN(endMs) && Date.now() > endMs) return null;
  const fields = update.fields.length > 0 ? update.fields.join(", ") : "Job details";
  const label = `Changed after you accepted${whenLabel(update.at) ? ` (${whenLabel(update.at)})` : ""}: ${fields}`;
  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-flex h-6 items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 text-[11px] font-semibold text-sky-800 whitespace-nowrap shrink-0 ${className}`}
    >
      Updated
    </span>
  );
}

/** Job page callout: what the agency changed after the interpreter accepted. */
export function UpdatedNotice({ update, endsAt }: { update?: DetailsUpdate | null; endsAt?: string }) {
  if (!update) return null;
  const endMs = endsAt ? new Date(endsAt).getTime() : Number.NaN;
  if (!Number.isNaN(endMs) && Date.now() > endMs) return null;
  return (
    <div role="status" className="mb-6 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-900">
      <p className="font-semibold">The agency updated this job after you accepted{whenLabel(update.at) ? ` (${whenLabel(update.at)})` : ""}.</p>
      <p className="mt-1">
        Changed: {update.fields.length > 0 ? update.fields.join(", ") : "job details"}. The details below are current; the update email lists the old and new values.
      </p>
    </div>
  );
}
