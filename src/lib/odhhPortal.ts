const ODHH_CONFIRM_BASE = "https://fortress.wa.gov/dshs/odhhapps/interpreters/servicerequest.aspx";

/**
 * The state's "Verification Form" page, which an interpreter completes after the assignment. It is the exact link the state prints
 * in every request email ("For Interpreter after assignment is completed (Verification Form)"): the same for every job, with no
 * job id, so nothing is appended to it.
 */
export const ODHH_VERIFICATION_FORM_URL = "https://fortress.wa.gov/dshs/odhhapps/Interpreters/AssignmentReport.aspx";

/**
 * Where staff confirm ("acknowledge") a job on the state portal: the same link the state prints in every request email
 * ("If you acknowledge this job, please click here"). With the SRN it opens that job; without one it opens the portal's list.
 */
export const buildOdhhConfirmUrl = (srn?: string | null): string => {
  const trimmed = typeof srn === "string" ? srn.trim() : "";
  return trimmed ? `${ODHH_CONFIRM_BASE}?id=${encodeURIComponent(trimmed)}` : ODHH_CONFIRM_BASE;
};
