import type { ClientContact, ClientData } from "@/db/schema";

/**
 * The email and phone an organization's card shows. The organization's own "General email / phone" come first; when staff
 * never typed them, the card uses a contact on file, a billing contact first (the state's request forms name one, and
 * the intake keeps it as a "Billing contact" on the organization), then a default contact, then any active contact. Email and
 * phone are looked for separately, so a contact with only a phone still supplies the phone. Pure; nothing is written.
 */

export interface ContactInfo {
  email: string;
  phone: string;
  /** Where each came from, for a tooltip ("Billing contact: Pat Lee"); null for the organization's own. */
  emailFrom: string | null;
  phoneFrom: string | null;
}

const clean = (value: string | null | undefined): string => (value ?? "").trim();
const isActive = (c: ClientContact): boolean => !c.isArchived;

/** Contacts in the order they are tried: default billing contact, other billing contacts, default contact, the rest. */
function ordered(contacts: ClientContact[]): ClientContact[] {
  const rank = (c: ClientContact): number => (c.type === "Billing contact" ? (c.isDefault ? 0 : 1) : c.isDefault ? 2 : 3);
  return contacts
    .filter(isActive)
    .map((c, index) => ({ c, index }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.index - b.index)
    .map(({ c }) => c);
}

const describe = (c: ClientContact): string => `${c.type === "Billing contact" ? "Billing contact" : "Contact"}${clean(c.name) ? `: ${clean(c.name)}` : ""}`;

export function contactInfoFor(data: Pick<ClientData, "generalEmail" | "generalPhone" | "contacts"> | null | undefined): ContactInfo {
  const contacts = ordered(data?.contacts ?? []);
  const withEmail = clean(data?.generalEmail) ? null : contacts.find((c) => clean(c.email));
  const withPhone = clean(data?.generalPhone) ? null : contacts.find((c) => clean(c.phone));
  return {
    email: clean(data?.generalEmail) || clean(withEmail?.email),
    phone: clean(data?.generalPhone) || clean(withPhone?.phone),
    emailFrom: withEmail ? describe(withEmail) : null,
    phoneFrom: withPhone ? describe(withPhone) : null,
  };
}
