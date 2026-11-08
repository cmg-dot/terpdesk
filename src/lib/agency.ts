/**
 * This workspace has a single agency. Until agencies get their own table, its id is shared here so the
 * roster rows (agency_interpreters.agency_id) and the agency list in the UI agree on it.
 */
export const DEFAULT_AGENCY_ID = "agency-1";

/** The workspace's display name, shown in the agency dashboard (there is no agency table to read it from yet). */
export const DEFAULT_AGENCY_NAME = "ASL Professionals";

/**
 * The agency's official logo (hands icon + wordmark, 907x314 transparent PNG) under /public. Shown in the sidebar and the mobile
 * menu while the ASL Professionals theme is active. The artwork is plum, so the dark sidebar seats it on a cream plate.
 */
export const AGENCY_LOGO_SRC = "/branding/asl-professionals-logo-final.png";

/** The zone the agency's day starts and ends in (the Interpreter View's timeline axis). Same default the request form uses. */
export const DEFAULT_AGENCY_TIME_ZONE = "America/Los_Angeles";
