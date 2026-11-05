import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";
import type { ClientContact, ClientData } from "@/db/schema";
import { logError } from "@/lib/logError";
import { isRealOrganization } from "@/lib/requestSummary";

/**
 * Puts the organization a state request form names (its "Billing Organization Name") into the Clients list, with its billing
 * contact, so the Clients tab fills itself as forms arrive. The tab links jobs to a client by organization NAME, so a client
 * created here picks up that organization's jobs without touching them.
 *
 * Safe to call from the email webhook (no login needed) and from scripts:
 *  - one row per organization: a lock on the lower-cased name serialises two forms for the same new organization;
 *  - add-only: an existing client keeps everything staff typed; a billing contact is added only when no contact has the same
 *    email (or, with no email, the same name); a matching contact's blank email / phone is filled, never overwritten;
 *  - an archived client is left exactly as staff left it;
 *  - placeholders ("WA ODHH", "General") are not organizations and are skipped.
 *
 * SERVER ONLY.
 */

export interface ClientSeed {
  organization: string;
  billingContact?: { name?: string | null; email?: string | null; phone?: string | null };
}

export interface ClientSeedResult {
  id: string;
  created: boolean;
  contactAdded: boolean;
}

type Executor = Pick<typeof db, "transaction">;

/** "Seattle  Children's " -> "Seattle Children's". */
export const normalizeOrgName = (value: string): string => value.replace(/\s+/g, " ").trim();
export const orgKey = (value: string): string => normalizeOrgName(value).toLowerCase();

const clean = (value: string | null | undefined): string => (value ?? "").trim();
const newId = (prefix: string): string => `${prefix}-${randomUUID().slice(0, 12)}`;

const sameContact = (c: ClientContact, name: string, email: string): boolean =>
  email ? c.email.trim().toLowerCase() === email.toLowerCase() : name !== "" && c.name.trim().toLowerCase() === name.toLowerCase();

export async function upsertClientFromForm(seed: ClientSeed, exec: Executor = db): Promise<ClientSeedResult | null> {
  const org = normalizeOrgName(seed.organization);
  if (!isRealOrganization(org)) return null;
  const email = clean(seed.billingContact?.email);
  const phone = clean(seed.billingContact?.phone);
  const name = clean(seed.billingContact?.name) || email;
  const now = new Date();

  return exec.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`client:${orgKey(org)}`}))`);
    const rows = await tx.select().from(clients);
    const match = rows.find((row) => orgKey(row.name) === orgKey(org));

    const stamp = (action: string, details: string) => ({ id: `${now.getTime()}-${randomUUID().slice(0, 6)}`, timestamp: now.toISOString(), user: "Email intake", action, details });
    const contactFor = (data: ClientData): ClientContact | null =>
      name || email
        ? {
            id: newId("c"),
            type: "Billing contact",
            name,
            role: "Billing (from the state request form)",
            email,
            phone,
            isDefault: !(data.contacts ?? []).some((c) => c.type === "Billing contact" && !c.isArchived),
            isArchived: false,
          }
        : null;

    if (!match) {
      const base: ClientData = { contacts: [], locations: [], auditLogs: [stamp("Client created", `Created from a state request form: ${org}`)] };
      const contact = contactFor(base);
      const data: ClientData = { ...base, contacts: contact ? [contact] : [] };
      const id = newId("client");
      await tx.insert(clients).values({ id, name: org, type: "organization", archived: false, data, createdAt: now });
      return { id, created: true, contactAdded: contact !== null };
    }

    // Staff archived this client: leave it exactly as it is.
    if (match.archived) return { id: match.id, created: false, contactAdded: false };

    const data = (match.data ?? { contacts: [], locations: [] }) as ClientData;
    const contacts = [...(data.contacts ?? [])];
    const index = name || email ? contacts.findIndex((c) => sameContact(c, name, email)) : -1;
    let changed = false;
    let contactAdded = false;
    if (index >= 0) {
      const existing = contacts[index];
      if (!existing.isArchived) {
        const filled = { ...existing, email: existing.email || email, phone: existing.phone || phone };
        if (filled.email !== existing.email || filled.phone !== existing.phone) {
          contacts[index] = filled;
          changed = true;
        }
      }
    } else {
      const contact = contactFor(data);
      if (contact) {
        contacts.push(contact);
        changed = true;
        contactAdded = true;
      }
    }
    if (changed) {
      const next: ClientData = { ...data, contacts, auditLogs: [...(data.auditLogs ?? []), stamp(contactAdded ? "Contact added" : "Contact filled", "From a state request form")] };
      await tx.update(clients).set({ data: next }).where(eq(clients.id, match.id));
    }
    return { id: match.id, created: false, contactAdded };
  });
}

/**
 * The webhook's call: never throws, so a Clients problem can never fail an intake (a 500 would make AWS retry an email whose
 * job is already saved). Returns what changed, or null.
 */
export async function seedClientQuietly(seed: ClientSeed): Promise<ClientSeedResult | null> {
  try {
    return await upsertClientFromForm(seed);
  } catch (err) {
    logError("seedClientFromForm", err);
    return null;
  }
}
