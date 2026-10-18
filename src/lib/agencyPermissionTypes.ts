/**
 * Client-safe: no database or server imports. The hook and the page may import this file;
 * `lib/agencyPermissions.ts` (which talks to the database) must only be imported by server code.
 */
export interface AgencyPermission {
  sharesAvailability: boolean;
  allowsAutoBook: boolean;
}

export const NO_PERMISSIONS: AgencyPermission = { sharesAvailability: false, allowsAutoBook: false };
