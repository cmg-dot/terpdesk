import { db } from "@/db";
import { interpreterProfiles } from "@/db/schema";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { getRosterInterpreters } from "@/lib/roster";
import { InterpretersPageClient } from "./InterpretersPageClient";

export const dynamic = "force-dynamic";

export default async function InterpretersPage() {
  // Fetch live interpreters list directly from PostgreSQL via Drizzle ORM
  const dbInterpreters = await getRosterInterpreters(DEFAULT_AGENCY_ID);

  // Fetch interpreter profile IDs to identify registered app users
  let registeredProfileIds: string[] = [];
  try {
    const profiles = await db
      .select({ interpreterId: interpreterProfiles.interpreterId })
      .from(interpreterProfiles);
    registeredProfileIds = profiles.map((p) => p.interpreterId);
  } catch (e) {
    console.error("Error fetching interpreter profiles:", e);
  }

  return (
    <InterpretersPageClient
      initialInterpreters={dbInterpreters}
      registeredProfileIds={registeredProfileIds}
    />
  );
}
