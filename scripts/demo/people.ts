import { randomUUID } from "node:crypto";
import type { InsertInterpreter, InsertInterpreterProfile, InsertUser, agencyInterpreters, availabilityRules, availabilityShares, notifications } from "@/db/schema";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import type { DemoInterpreter, InterpreterKey } from "./fixtures";
import { ZONE, localDate } from "./schedule";

/**
 * The demo agency's logins and roster. The agency admin and the two primary interpreters can sign in (one shared password, no
 * two-step verification devices, so there is no 2FA prompt); the other six are agency-added profiles with no login, the way a
 * roster import leaves them. Everyone is approved and active on the workspace's agency id, with availability shared. Only the
 * two sign-in interpreters have email notifications on.
 */

export interface PeopleRows {
  users: InsertUser[];
  interpreters: InsertInterpreter[];
  roster: (typeof agencyInterpreters.$inferInsert)[];
  profiles: InsertInterpreterProfile[];
  shares: (typeof availabilityShares.$inferInsert)[];
  rules: (typeof availabilityRules.$inferInsert)[];
  notifications: (typeof notifications.$inferInsert)[];
  byKey: Map<InterpreterKey, { id: string; name: string }>;
}

const WEEKDAYS = [1, 2, 3, 4, 5];

export function buildPeopleRows(params: { interpreters: DemoInterpreter[]; admin: { email: string; name: string }; passwordHash: string; now: Date }): PeopleRows {
  const { interpreters, admin, passwordHash, now } = params;
  const adminId = randomUUID();
  const rows: PeopleRows = {
    users: [{ id: adminId, email: admin.email, passwordHash, name: admin.name, role: "agency", accountStatus: "approved" }],
    interpreters: [],
    roster: [],
    profiles: [],
    shares: [],
    rules: [],
    notifications: [],
    byKey: new Map(),
  };

  for (const person of interpreters) {
    const interpreterId = randomUUID();
    const userId = person.login ? randomUUID() : null;
    if (userId) rows.users.push({ id: userId, email: person.email, passwordHash, name: person.name, role: "interpreter", accountStatus: "approved" });
    rows.interpreters.push({ id: interpreterId, name: person.name, email: person.email, phone: person.phone, userId });
    // Only the two sign-in interpreters (the demo team's real, SES-verified inboxes) get email; the rest stay muted like production.
    rows.roster.push({ agencyId: DEFAULT_AGENCY_ID, interpreterId, userId, status: "approved", isActive: true, emailNotificationsEnabled: person.login });
    const virtualOnly = person.serviceAreas.includes("Virtual Only");
    rows.profiles.push({
      id: randomUUID(),
      interpreterId,
      timeZone: ZONE,
      shortBio: person.bio,
      city: person.city,
      stateOrRegion: "WA",
      serviceArea: person.serviceAreas.join(", "),
      serviceAreas: person.serviceAreas,
      liabilityInsuranceExpiration: localDate(now, 240),
      stateRate: person.rates.state,
      nonStateRate: person.rates.nonState,
      certification: person.certification,
      takesInPerson: !virtualOnly,
      takesVirtual: true,
      workPhone: person.phone,
      contactVisibility: "shared",
    });
    rows.shares.push({ id: randomUUID(), agencyId: DEFAULT_AGENCY_ID, interpreterId, enabled: true, allowsAutoBook: person.login });
    for (const weekday of WEEKDAYS) rows.rules.push({ id: randomUUID(), interpreterId, weekday, startMinute: virtualOnly ? 9 * 60 : 8 * 60, endMinute: virtualOnly ? 18 * 60 : 17 * 60 });
    rows.byKey.set(person.key, { id: interpreterId, name: person.name });
  }

  // The bell icon's first entries. No client or appointment details, like every real notification.
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
  rows.notifications.push(
    { userId: adminId, title: "Hours submitted", message: "An interpreter submitted hours for review.", type: "job", href: "/hours-review", createdAt: minutesAgo(240) },
    { userId: adminId, title: "Offer declined", message: "An interpreter declined an offer. The job needs a replacement.", type: "job", href: "/requests", createdAt: minutesAgo(600) },
    { userId: adminId, title: "Welcome to the demo", message: "This sandbox agency is filled with fictional jobs, clients and interpreters.", type: "system", href: "/dashboard", isRead: true, createdAt: minutesAgo(2880) },
  );
  return rows;
}
