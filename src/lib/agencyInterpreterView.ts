import { and, asc, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import {
  agencyInterpreters,
  availabilityExceptions,
  availabilityRules,
  busyBlocks,
  credentials,
  interpreterProfiles,
  interpreters,
  offers,
  requests,
} from "@/db/schema";
import { ensureAvailabilityTables, resolveInterpreterIds } from "@/app/actions/availability";
import { ensureAgencyInterpreterColumns } from "@/lib/agencyInterpreterColumns";
import { isRegisteredInterpreter } from "@/lib/interpreterAccount";
import { isPlaceholderEmail } from "@/lib/placeholderEmail";
import { readPermission } from "@/lib/agencyPermissions";
import { filesFor } from "@/lib/credentials";
import { hasValidCommercialAuto } from "@/lib/insurance";
import { areasFromLegacy } from "@/lib/serviceAreas";
import { rateToText } from "@/lib/validation/interpreterRates";
import type { InterpreterRatesInput } from "@/lib/validation/interpreterRates";
import type { CredentialFile } from "@/lib/validation/file";
import { summarizeAvailability } from "@/lib/availabilitySummary";
import type { DayAvailability } from "@/lib/availabilitySummary";
import { getIanaZone, resolveRequestTimes } from "@/utils/timezone";

const SUMMARY_DAYS = 14;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SharedCredentialView {
  id: string;
  name: string;
  type: string;
  issuedBy: string;
  issueDate: string;
  expirationDate: string;
  /** "liability" / "commercial_auto" for the dedicated insurance policies, else "". */
  insuranceKind: string;
  /** A policy's limits as the interpreter wrote them ("" when none). */
  coverageLimits: string;
  /** Supporting files (private S3; opened through a short-lived signed link after the file authorization check). */
  files: CredentialFile[];
}

export interface AgencyInterpreterView {
  id: string;
  name: string;
  isRegistered: boolean;
  /** Their sign-in / dispatch email; "" when only the bulk-import placeholder is on file. Agency-only. */
  email: string;
  hasPlaceholderEmail: boolean;
  /** This agency's switch for operational email to them (off by default). */
  emailNotificationsEnabled: boolean;
  photoUrl: string;
  city: string;
  stateOrRegion: string;
  serviceAreas: string[];
  /** Certifications and qualifications as imported or recorded by the agency; "" when none. Agency-only, like rates. */
  certification: string;
  /** yyyy-MM-dd, or "" when the interpreter has not recorded it. */
  liabilityInsuranceExpiration: string;
  /** The hourly rates this agency has set, as text ("" = not set). Agency-only: this view is never sent to an interpreter. */
  rates: InterpreterRatesInput;
  timeZone: string;
  takesInPerson: boolean;
  takesVirtual: boolean;
  /** Present only when the interpreter chose "Agencies I am connected to". */
  contact: { workEmail: string; workPhone: string } | null;
  credentials: SharedCredentialView[];
  /** A current commercial auto policy: in-person jobs pay +$10 ("Commercial Auto (+$10 in-person)"). */
  commercialAuto: boolean;
  /** Free hours and private busy time are only included when the interpreter shares availability with this agency. */
  sharesAvailability: boolean;
  days: DayAvailability[];
}

/**
 * Everything an agency may see about one interpreter on its roster, already filtered by the interpreter's choices.
 * Returns null unless the agency has an approved connection with the interpreter.
 *
 * SERVER ONLY: queries the database. The caller must have checked the agency role.
 */
export async function loadAgencyInterpreterView(agencyId: string, interpreterId: string): Promise<AgencyInterpreterView | null> {
  if (!UUID.test(interpreterId)) return null;
  await ensureAgencyInterpreterColumns();
  await ensureAvailabilityTables();

  const [row] = await db
    .select({
      id: interpreters.id,
      name: interpreters.name,
      email: interpreters.email,
      userId: interpreters.userId,
      emailNotificationsEnabled: agencyInterpreters.emailNotificationsEnabled,
    })
    .from(interpreters)
    .innerJoin(agencyInterpreters, eq(agencyInterpreters.interpreterId, interpreters.id))
    .where(and(eq(interpreters.id, interpreterId), eq(agencyInterpreters.agencyId, agencyId), eq(agencyInterpreters.status, "approved")))
    .limit(1);
  if (!row) return null;

  const [profile] = await db
    .select()
    .from(interpreterProfiles)
    .where(eq(interpreterProfiles.interpreterId, interpreterId))
    .orderBy(desc(interpreterProfiles.updatedAt))
    .limit(1);

  // Every ACTIVE credential of an interpreter on this agency's roster (the approved connection is checked above), with its files:
  // visibility to the agency is not optional. Numbers and notes are not selected; archived credentials stay hidden.
  const sharedCredentials = await db
    .select({
      id: credentials.id,
      name: credentials.name,
      type: credentials.type,
      issuedBy: credentials.issuedBy,
      issueDate: credentials.issueDate,
      expirationDate: credentials.expirationDate,
      insuranceKind: credentials.insuranceKind,
      coverageLimits: credentials.coverageLimits,
    })
    .from(credentials)
    .where(and(eq(credentials.interpreterId, interpreterId), eq(credentials.isArchived, false)))
    .orderBy(asc(credentials.name));

  const filesByCredential = await filesFor(sharedCredentials.map((c) => c.id));

  const timeZone = getIanaZone(profile?.timeZone ?? "America/Los_Angeles");
  const { sharesAvailability } = await readPermission(agencyId, interpreterId);
  const now = new Date();
  const windowEnd = new Date(now.getTime() + (SUMMARY_DAYS + 1) * 86_400_000);

  // Jobs the interpreter accepted from this agency are the agency's own data, so they always show.
  const accepted = await db
    .select({ requestId: requests.id, status: requests.status, data: requests.data, createdAt: requests.createdAt })
    .from(offers)
    .innerJoin(requests, eq(offers.requestId, requests.id))
    .where(and(eq(offers.interpreterId, interpreterId), eq(offers.status, "accepted")));
  const booked = accepted
    .filter((r) => !["cancelled", "canceled"].includes(String(r.status ?? "").toLowerCase()))
    .map((r) => {
      const t = resolveRequestTimes({ createdAt: r.createdAt, data: r.data });
      return { requestId: r.requestId, startsAt: new Date(t.startsAt), endsAt: new Date(t.endsAt) };
    })
    .filter((b) => !Number.isNaN(b.startsAt.getTime()) && b.endsAt > now && b.startsAt < windowEnd);

  let rules: { weekday: number; startMinute: number; endMinute: number }[] = [];
  let exceptions: { onDate: string; available: boolean; startMinute: number | null; endMinute: number | null }[] = [];
  let busy: { startsAt: Date; endsAt: Date }[] = [];
  if (sharesAvailability) {
    const ids = await resolveInterpreterIds(interpreterId);
    rules = await db
      .select({ weekday: availabilityRules.weekday, startMinute: availabilityRules.startMinute, endMinute: availabilityRules.endMinute })
      .from(availabilityRules)
      .where(inArray(availabilityRules.interpreterId, ids));
    exceptions = await db
      .select({
        onDate: availabilityExceptions.onDate,
        available: availabilityExceptions.available,
        startMinute: availabilityExceptions.startMinute,
        endMinute: availabilityExceptions.endMinute,
      })
      .from(availabilityExceptions)
      .where(inArray(availabilityExceptions.interpreterId, ids));
    // Busy time is private: only its start and end are read, never its title.
    busy = await db
      .select({ startsAt: busyBlocks.startsAt, endsAt: busyBlocks.endsAt })
      .from(busyBlocks)
      .where(and(inArray(busyBlocks.interpreterId, ids), gt(busyBlocks.endsAt, now), lt(busyBlocks.startsAt, windowEnd)));
  }

  const contactShared = profile?.contactVisibility === "shared";
  const autoPolicy = sharedCredentials.find((c) => c.insuranceKind === "commercial_auto");
  return {
    id: row.id,
    name: profile?.preferredName || row.name,
    isRegistered: isRegisteredInterpreter(row),
    email: isPlaceholderEmail(row.email) ? "" : row.email,
    hasPlaceholderEmail: isPlaceholderEmail(row.email),
    emailNotificationsEnabled: row.emailNotificationsEnabled,
    photoUrl: profile?.photoUrl ?? "",
    city: profile?.city ?? "",
    stateOrRegion: profile?.stateOrRegion ?? "",
    serviceAreas: profile && profile.serviceAreas.length > 0 ? profile.serviceAreas : areasFromLegacy(profile?.serviceArea),
    certification: profile?.certification ?? "",
    liabilityInsuranceExpiration: profile?.liabilityInsuranceExpiration ?? "",
    rates: {
      stateRate: rateToText(profile?.stateRate),
      kingCountyRate: rateToText(profile?.kingCountyRate),
      nonStateRate: rateToText(profile?.nonStateRate),
    },
    timeZone,
    takesInPerson: profile?.takesInPerson ?? true,
    takesVirtual: profile?.takesVirtual ?? true,
    contact: contactShared ? { workEmail: profile?.workEmail ?? "", workPhone: profile?.workPhone ?? "" } : null,
    credentials: sharedCredentials.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      issuedBy: c.issuedBy ?? "",
      issueDate: c.issueDate ?? "",
      expirationDate: c.expirationDate ?? "",
      insuranceKind: c.insuranceKind ?? "",
      coverageLimits: c.coverageLimits ?? "",
      files: filesByCredential.get(c.id) ?? [],
    })),
    commercialAuto: hasValidCommercialAuto(autoPolicy?.expirationDate ? { expirationDate: autoPolicy.expirationDate } : null, timeZone),
    sharesAvailability,
    days: summarizeAvailability({ timeZone, rules, exceptions, busy, booked }, now, SUMMARY_DAYS),
  };
}
