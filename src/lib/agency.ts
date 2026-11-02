/**
 * This workspace has a single agency. Until agencies get their own table, its id is shared here so the
 * roster rows (agency_interpreters.agency_id) and the agency list in the UI agree on it.
 */
export const DEFAULT_AGENCY_ID = "agency-1";

/** The workspace's display name, shown in the agency dashboard (there is no agency table to read it from yet). */
export const DEFAULT_AGENCY_NAME = "ASL Professionals";

/** The zone the agency's day starts and ends in (the Interpreter View's timeline axis). Same default the request form uses. */
export const DEFAULT_AGENCY_TIME_ZONE = "America/Los_Angeles";
