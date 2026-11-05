/**
 * Whether a job belongs to an organization: the job names it (client, requester organization, billing organization, ...).
 * The Organizations list counts linked jobs with this, and the contact backfill reads those jobs' forms with it. Matching is by
 * name only (case-insensitive), exactly as the list always has. Pure.
 */
export function matchesClientRequest(requestRow: { data: unknown }, clientName: string): boolean {
  if (!clientName || !clientName.trim()) return false;
  const target = clientName.trim().toLowerCase();
  const rData = (requestRow?.data || {}) as Record<string, any>;

  const candidateFields: Array<string | undefined | null> = [
    rData.client,
    rData.clientName,
    rData.requester?.org,
    rData.requester?.billOrg,
    rData.details?.organization,
    rData.details?.client,
    rData.intake?.organization,
    rData.intake?.org,
    rData.intake?.client,
    rData.overview?.organization,
    rData.overview?.client,
  ];

  return candidateFields.some((field) => typeof field === "string" && field.trim() !== "" && field.trim().toLowerCase() === target);
}
