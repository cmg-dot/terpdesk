/**
 * This workspace has a single agency. Until agencies get their own table, its id is shared here so the
 * roster rows (agency_interpreters.agency_id) and the agency list in the UI agree on it.
 */
export const DEFAULT_AGENCY_ID = "agency-1";

/** Kari Owen's agency: the production workspace. Its name, logo and invoice letterhead are the defaults below. */
const ASL_PROFESSIONALS = "ASL Professionals";

/**
 * The workspace's display name, shown in the agency dashboard (there is no agency table to read it from yet). A separate deployment
 * (the demo) sets NEXT_PUBLIC_AGENCY_NAME to show its own name; the id above stays the same, so every query works unchanged.
 * Read as a literal `process.env.NEXT_PUBLIC_...` so Next inlines it into the browser bundle too.
 */
export const DEFAULT_AGENCY_NAME = process.env.NEXT_PUBLIC_AGENCY_NAME?.trim() || ASL_PROFESSIONALS;

/** True on Kari's own deployment: the only one that may show her logo, contact details and invoice letterhead. */
export const IS_ASL_PROFESSIONALS = DEFAULT_AGENCY_NAME === ASL_PROFESSIONALS;

/**
 * The agency's official logo (hands icon + wordmark, 907x314 transparent PNG) under /public. Shown in the sidebar and the mobile
 * menu while the ASL Professionals theme is active. The artwork is plum, so the dark sidebar seats it on a cream plate.
 * NEXT_PUBLIC_AGENCY_LOGO_SRC may point at another image under /public for another deployment.
 */
export const AGENCY_LOGO_SRC = process.env.NEXT_PUBLIC_AGENCY_LOGO_SRC?.trim() || "/branding/asl-professionals-logo-final.png";

/** The zone the agency's day starts and ends in (the Interpreter View's timeline axis). Same default the request form uses. */
export const DEFAULT_AGENCY_TIME_ZONE = "America/Los_Angeles";
