/**
 * The first-look facts of a request: who it is for, its state SRN, and where it is. Pure functions over the request as the
 * agency screens receive it (see fetchLiveRequestById), so the header, the overview and the tests all read the same rules.
 */

interface SummarySource {
  title?: string | null;
  client?: string | null;
  requester?: { org?: unknown; billOrg?: unknown } | null;
  data?: { client?: unknown; intake?: { odhhSrn?: unknown } } | null;
  isVirtual?: boolean | null;
  platform?: string | null;
  location?: string | null;
  onsite?: { venue?: unknown; address?: unknown; building?: unknown; floor?: unknown; room?: unknown } | null;
}

const text = (value: unknown): string => (typeof value === "string" || typeof value === "number" ? String(value).trim() : "");

/** Values that sit in the organization field when nobody named one: a funding program, or a form's placeholder. */
const NOT_AN_ORGANIZATION = new Set(["wa odhh", "odhh", "wa apple health", "general", "organization not provided", "organization on file"]);
export const isRealOrganization = (value: string): boolean => value !== "" && !NOT_AN_ORGANIZATION.has(value.toLowerCase()) && !value.toLowerCase().startsWith("new or one-time");

/** "Seattle Children's", "DVR Access for Participants": the first real name among the requester's organization, the saved client and the bill-to. */
export function requestOrganization(request: SummarySource): string | null {
  for (const candidate of [request.requester?.org, request.data?.client, request.client, request.requester?.billOrg]) {
    const name = text(candidate);
    if (isRealOrganization(name)) return name;
  }
  return null;
}

/** The state's service request number (SRN), or null when the job has none (a private request). */
export function requestSrn(request: SummarySource): string | null {
  return text(request.data?.intake?.odhhSrn) || null;
}

export interface RequestWhere {
  /** One line, parts joined with " · " (the overview shows each part on its own line). */
  text: string;
  parts: string[];
  virtual: boolean;
  /** An in-person job with no street address on file: the screen says so instead of looking complete. */
  missingAddress: boolean;
}

const LOCATION_PLACEHOLDERS = new Set(["location pending", "virtual", "tbd"]);

/** "Virtual · Zoom", or the venue with its street address, building, floor and room. */
export function requestWhere(request: SummarySource): RequestWhere {
  if (request.isVirtual) {
    const platform = text(request.platform);
    const parts = ["Virtual", ...(platform && platform.toLowerCase() !== "virtual" ? [platform] : [])];
    return { text: parts.join(" · "), parts, virtual: true, missingAddress: false };
  }
  const venue = text(request.onsite?.venue);
  const address = text(request.onsite?.address);
  const place = venue && !LOCATION_PLACEHOLDERS.has(venue.toLowerCase()) ? venue : "";
  const extras = [
    text(request.onsite?.building) ? `Building ${text(request.onsite?.building)}` : "",
    text(request.onsite?.floor) ? `Floor ${text(request.onsite?.floor)}` : "",
    text(request.onsite?.room) ? `Room ${text(request.onsite?.room)}` : "",
  ].filter(Boolean);
  const labelFallback = text(request.location);
  const parts = [place || (address ? "" : LOCATION_PLACEHOLDERS.has(labelFallback.toLowerCase()) ? "" : labelFallback), address, ...extras].filter(Boolean);
  if (parts.length === 0) return { text: "Location pending", parts: ["Location pending"], virtual: false, missingAddress: true };
  return { text: parts.join(" · "), parts, virtual: false, missingAddress: address === "" };
}
