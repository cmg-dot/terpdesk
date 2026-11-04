const ODHH_PORTAL_BASE = "https://fortress.wa.gov/dshs/odhhapps/Interpreters/AssignmentReport.aspx";
const ODHH_CONFIRM_BASE = "https://fortress.wa.gov/dshs/odhhapps/interpreters/servicerequest.aspx";

/** State ODHH portal assignment-report page, with the SRN appended when known. */
export const buildOdhhPortalUrl = (srn?: string | null): string => {
  const trimmed = typeof srn === "string" ? srn.trim() : "";
  return trimmed ? `${ODHH_PORTAL_BASE}?id=${encodeURIComponent(trimmed)}` : ODHH_PORTAL_BASE;
};

/**
 * Where staff confirm ("acknowledge") a job on the state portal: the same link the state prints in every request email
 * ("If you acknowledge this job, please click here"). With the SRN it opens that job; without one it opens the portal's list.
 */
export const buildOdhhConfirmUrl = (srn?: string | null): string => {
  const trimmed = typeof srn === "string" ? srn.trim() : "";
  return trimmed ? `${ODHH_CONFIRM_BASE}?id=${encodeURIComponent(trimmed)}` : ODHH_CONFIRM_BASE;
};
