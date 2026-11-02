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
  // The four reads are independent and each costs a round trip to the database, so they run together instead of one
  // after another. Only the roster is essential: a failure in the others empties just that part of the page.
  const quietly = async <T,>(label: string, fallback: T, read: () => Promise<T>): Promise<T> => {
    try {
      return await read();
    } catch (err) {
      logError(`InterpretersPage.${label}`, err);
      return fallback;
    }
  };
  const [rosterRows, certifications, joinRequests, websiteProfiles] = await Promise.all([
    getRosterInterpreters(DEFAULT_AGENCY_ID),
    // Credentials text for the directory's Credentials filter. Agency-only page, so it may carry it.
    quietly("certifications", new Map<string, string>(), () => getRosterCertifications(DEFAULT_AGENCY_ID)),
    // Join requests: pending agency_interpreters rows for this agency (scoped on the server, never by the browser).
    quietly<PendingConnection[]>("joinRequests", [], () => getPendingConnectionRequests()),
    // Website profiles: interpreters who opted in (pending) or were approved. Public fields only.
    quietly<WebsiteProfileRequest[]>("websiteProfiles", [], () => getWebsiteProfileRequests()),
  ]);
  const dbInterpreters = rosterRows.map((row) => ({ ...row, certification: certifications.get(row.id) ?? "" }));

  return (
    <InterpretersPageClient
      initialInterpreters={dbInterpreters}
      initialJoinRequests={joinRequests}
      initialWebsiteProfiles={websiteProfiles}
      initialTab={parseTab(searchParams.tab)}
    />
  );
}
