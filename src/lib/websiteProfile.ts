/**
 * Shapes for the agency-website opt-in (client-safe: no server imports).
 * A public profile is deliberately limited to four fields; contact details and sign-in emails are never part of it.
 */
export type WebsitePermission = "not_shared" | "pending" | "approved";

export interface PublicProfile {
  name: string;
  photoUrl: string;
  serviceArea: string;
  bio: string;
}

/** The interpreter's own view: their website permission per connected agency. */
export interface MyWebsiteSharing {
  agencyId: string;
  status: WebsitePermission;
}

/** The agency's view: an interpreter who opted in (pending) or was approved, with their public profile only. */
export interface WebsiteProfileRequest {
  connectionId: string;
  status: "pending" | "approved";
  profile: PublicProfile;
}

export const toPublicProfile = (p: {
  preferredName: string;
  fullName: string;
  photoUrl: string;
  serviceArea: string;
  shortBio: string;
}): PublicProfile => ({
  name: p.preferredName || p.fullName,
  photoUrl: p.photoUrl,
  serviceArea: p.serviceArea,
  bio: p.shortBio,
});
