const ODHH_PORTAL_BASE = "https://fortress.wa.gov/dshs/odhhapps/Interpreters/AssignmentReport.aspx";

/** State ODHH portal assignment-report page, with the SRN appended when known. */
export const buildOdhhPortalUrl = (srn?: string | null): string => {
  const trimmed = typeof srn === "string" ? srn.trim() : "";
  return trimmed ? `${ODHH_PORTAL_BASE}?id=${encodeURIComponent(trimmed)}` : ODHH_PORTAL_BASE;
};
