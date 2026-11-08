import { DEFAULT_AGENCY_NAME } from "@/lib/agency";

/**
 * A quiet "who this came from" tag for the external interpreter's job page. Neutral slate on purpose: interpreters are not
 * part of the agency's themed workspace, so the agency's brand colours never appear here.
 */
export const AssignedByBadge = ({ agencyName }: { agencyName?: string }) => (
  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
    Assigned by {agencyName?.trim() || DEFAULT_AGENCY_NAME}
  </span>
);
