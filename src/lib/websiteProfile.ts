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

/** The stored values behind the four public fields (null = not set). */
export interface PublicFieldValues {
  preferredName: string | null;
  photoUrl: string | null;
  shortBio: string | null;
  serviceArea: string | null;
}

/**
 * Did an edit change anything an agency website would show? Compares the name as it would appear (preferred name,
 * else the account name) plus photo, bio and service area. Private fields (phone, email, time zone, work modes)
 * are not part of the comparison, so editing them never triggers a re-review.
 */
export const publicFieldsChanged = (accountName: string, before: PublicFieldValues | null, after: PublicFieldValues): boolean => {
  const text = (v: string | null | undefined) => (v ?? "").trim();
  const name = (v: PublicFieldValues | null) => text(v?.preferredName) || text(accountName);
  return (
    name(before) !== name(after) ||
    text(before?.photoUrl) !== text(after.photoUrl) ||
    text(before?.shortBio) !== text(after.shortBio) ||
    text(before?.serviceArea) !== text(after.serviceArea)
  );
};

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
