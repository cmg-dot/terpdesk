import { getPendingConnectionRequests } from "@/app/actions/approvalActions";
import type { PendingConnection } from "@/app/actions/approvalActions";
import { getWebsiteProfileRequests } from "@/app/actions/websiteProfiles";
import type { WebsiteProfileRequest } from "@/lib/websiteProfile";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { logError } from "@/lib/logError";
import { getRosterCertifications, getRosterInterpreters } from "@/lib/roster";
import { InterpretersPageClient } from "./InterpretersPageClient";
import type { InterpretersTab } from "./InterpretersPageClient";

export const dynamic = "force-dynamic";

const parseTab = (value: string | undefined): InterpretersTab =>
  value === "requests" || value === "website" ? value : "roster";

export default async function InterpretersPage({ searchParams }: { searchParams: { tab?: string } }) {
  // Fetch live interpreters list directly from PostgreSQL via Drizzle ORM
  const rosterRows = await getRosterInterpreters(DEFAULT_AGENCY_ID);

  // Credentials text for the directory's Credentials filter. Agency-only page, so it may carry it; a failure only
  // empties the filter, it never hides the roster.
  let certifications = new Map<string, string>();
  try {
    certifications = await getRosterCertifications(DEFAULT_AGENCY_ID);
  } catch (err) {
    logError("InterpretersPage.certifications", err);
  }
  const dbInterpreters = rosterRows.map((row) => ({ ...row, certification: certifications.get(row.id) ?? "" }));

  // Join requests: pending agency_interpreters rows for this agency (scoped on the server, never by the browser).
  let joinRequests: PendingConnection[] = [];
  try {
    joinRequests = await getPendingConnectionRequests();
  } catch (err) {
    logError("InterpretersPage.joinRequests", err);
  }

  // Website profiles: interpreters who opted in (pending) or were approved. Public fields only.
  let websiteProfiles: WebsiteProfileRequest[] = [];
  try {
    websiteProfiles = await getWebsiteProfileRequests();
  } catch (err) {
    logError("InterpretersPage.websiteProfiles", err);
  }

  return (
    <InterpretersPageClient
      initialInterpreters={dbInterpreters}
      initialJoinRequests={joinRequests}
      initialWebsiteProfiles={websiteProfiles}
      initialTab={parseTab(searchParams.tab)}
    />
  );
}
