"use server";

import { clientTypeSchema, normalizeClientType } from "@/lib/validation/client";
import type { ClientType } from "@/lib/validation/client";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/db";
import { clients, requests, type ClientContact, type ClientLocation, type ClientData, type SelectClient } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

let clientsTableEnsured = false;

export async function ensureClientsTable() {
  await requireRole("agency");
  if (clientsTableEnsured) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'organization',
        archived BOOLEAN NOT NULL DEFAULT FALSE,
        data JSONB NOT NULL DEFAULT '{"contacts": [], "locations": []}'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    clientsTableEnsured = true;
  } catch (err) {
    console.error("Failed to ensure clients table:", err);
  }
}

export interface ClientWithStats {
  id: string;
  name: string;
  type: ClientType;
  isArchived: boolean;
  generalEmail?: string;
  generalPhone?: string;
  billingOrg?: string;
  billingAddress?: string;
  privateNotes?: string;
  contacts: ClientContact[];
  locations: ClientLocation[];
  auditLogs?: any[];
  linkedJobsCount: number;
  stats: string;
  contactSummary: string;
}

function matchesClientRequest(requestRow: { data: any }, clientName: string): boolean {
  if (!clientName || !clientName.trim()) return false;
  const target = clientName.trim().toLowerCase();
  const rData = (requestRow?.data || {}) as any;

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
    rData.overview?.client
  ];

  return candidateFields.some(field => {
    if (typeof field === "string" && field.trim()) {
      return field.trim().toLowerCase() === target;
    }
    return false;
  });
}

export async function getClientsAction(): Promise<ClientWithStats[]> {
  await requireRole("agency");
  await ensureClientsTable();

  try {
    const clientRows = await db.select().from(clients).orderBy(desc(clients.createdAt));
    const requestRows = await db.select({
      id: requests.id,
      title: requests.title,
      data: requests.data
    }).from(requests);

    return clientRows.map(c => {
      const cData = (c.data || {}) as ClientData;
      const contacts = cData.contacts || [];
      const locations = cData.locations || [];

      // Dynamically compute linked jobs matching organization name or client name
      const linkedJobs = requestRows.filter(r => matchesClientRequest(r, c.name));

      const linkedJobsCount = linkedJobs.length;
      const stats = `${contacts.length} contacts · ${locations.length} locations · ${linkedJobsCount} linked jobs`;

      const defaultContact = contacts.find(co => co.isDefault && !co.isArchived) || contacts.find(co => !co.isArchived);
      const contactSummary = [
        cData.generalEmail || defaultContact?.email,
        cData.generalPhone || defaultContact?.phone
      ].filter(Boolean).join(" · ") || "No contact info";

      return {
        id: c.id,
        name: c.name,
        type: normalizeClientType(c.type),
        isArchived: Boolean(c.archived),
        generalEmail: cData.generalEmail || "",
        generalPhone: cData.generalPhone || "",
        billingOrg: cData.billingOrganization || cData.billingOrg || "",
        billingAddress: cData.billingAddress || "",
        privateNotes: cData.privateNotes || "",
        contacts,
        locations,
        auditLogs: cData.auditLogs || [],
        linkedJobsCount,
        stats,
        contactSummary
      };
    });
  } catch (err) {
    console.error("Error in getClientsAction:", err);
    return [];
  }
}

export async function getClientByIdAction(id: string) {
  await requireRole("agency");
  await ensureClientsTable();

  try {
    const rows = await db.select().from(clients).where(eq(clients.id, id));
    if (!rows || rows.length === 0) return null;
    const c = rows[0];
    const cData = (c.data || {}) as ClientData;
    const contacts = cData.contacts || [];
    const locations = cData.locations || [];

    const requestRows = await db.select().from(requests);
    const linkedJobs = requestRows.filter(r => matchesClientRequest(r, c.name));

    return {
      id: c.id,
      name: c.name,
      type: normalizeClientType(c.type),
      isArchived: Boolean(c.archived),
      generalEmail: cData.generalEmail || "",
      generalPhone: cData.generalPhone || "",
      billingOrg: cData.billingOrganization || cData.billingOrg || "",
      billingAddress: cData.billingAddress || "",
      privateNotes: cData.privateNotes || "",
      contacts,
      locations,
      auditLogs: cData.auditLogs || [],
      linkedJobsCount: linkedJobs.length,
      linkedJobs: linkedJobs.map(j => ({
        id: j.id,
        title: j.title,
        status: j.status,
        createdAt: j.createdAt,
        data: j.data
      }))
    };
  } catch (err) {
    console.error("Error in getClientByIdAction:", err);
    return null;
  }
}

export async function createClientAction(payload: {
  name: string;
  type?: string;
  generalEmail?: string;
  generalPhone?: string;
  billingOrganization?: string;
  billingAddress?: string;
  privateNotes?: string;
}) {
  const session = await requireRole("agency");
  await ensureClientsTable();

  const id = `client-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const data: ClientData = {
    generalEmail: (payload.generalEmail || "").trim(),
    generalPhone: (payload.generalPhone || "").trim(),
    billingOrganization: (payload.billingOrganization || "").trim(),
    billingOrg: (payload.billingOrganization || "").trim(),
    billingAddress: (payload.billingAddress || "").trim(),
    privateNotes: (payload.privateNotes || "").trim(),
    contacts: [],
    locations: [],
    auditLogs: [{
      id: `${Date.now()}-created`,
      timestamp: now,
      user: session.user.name ?? "Agency staff",
      action: "Client created",
      details: `Client created - ${payload.name.trim()}`
    }]
  };

  await db.insert(clients).values({
    id,
    name: payload.name.trim(),
    // Only the four canonical types are accepted; anything else is rejected rather than stored.
    type: payload.type === undefined ? "organization" : clientTypeSchema.parse(payload.type),
    archived: false,
    data,
    createdAt: new Date()
  });

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  revalidatePath("/requests/new");
  revalidatePath("/requests");

  return id;
}

export async function updateClientAction(id: string, updates: {
  name?: string;
  type?: string;
  archived?: boolean;
  generalEmail?: string;
  generalPhone?: string;
  billingOrganization?: string;
  billingOrg?: string;
  billingAddress?: string;
  privateNotes?: string;
}) {
  const session = await requireRole("agency");
  await ensureClientsTable();

  const rows = await db.select().from(clients).where(eq(clients.id, id));
  if (!rows || rows.length === 0) throw new Error("Client not found");
  const existing = rows[0];
  const existingData = (existing.data || {}) as ClientData;

  const newName = updates.name !== undefined ? updates.name.trim() : existing.name;
  const newType = updates.type !== undefined ? clientTypeSchema.parse(updates.type) : normalizeClientType(existing.type);
  const newArchived = updates.archived !== undefined ? updates.archived : existing.archived;

  const now = new Date().toISOString();
  const log = {
    id: `${Date.now()}-update`,
    timestamp: now,
    user: session.user.name ?? "Agency staff",
    action: "Client updated",
    details: "Client details were updated"
  };

  const updatedData: ClientData = {
    ...existingData,
    generalEmail: updates.generalEmail !== undefined ? updates.generalEmail.trim() : existingData.generalEmail,
    generalPhone: updates.generalPhone !== undefined ? updates.generalPhone.trim() : existingData.generalPhone,
    billingOrganization: updates.billingOrganization !== undefined ? updates.billingOrganization.trim() : (updates.billingOrg !== undefined ? updates.billingOrg.trim() : existingData.billingOrganization),
    billingOrg: updates.billingOrganization !== undefined ? updates.billingOrganization.trim() : (updates.billingOrg !== undefined ? updates.billingOrg.trim() : existingData.billingOrg),
    billingAddress: updates.billingAddress !== undefined ? updates.billingAddress.trim() : existingData.billingAddress,
    privateNotes: updates.privateNotes !== undefined ? updates.privateNotes.trim() : existingData.privateNotes,
    auditLogs: [log, ...(existingData.auditLogs || [])]
  };

  await db.update(clients).set({
    name: newName,
    type: newType,
    archived: newArchived,
    data: updatedData
  }).where(eq(clients.id, id));

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  revalidatePath("/requests/new");
  revalidatePath("/requests");
}

export async function archiveClientAction(id: string, archived: boolean) {
  const session = await requireRole("agency");
  await ensureClientsTable();

  const rows = await db.select().from(clients).where(eq(clients.id, id));
  if (!rows || rows.length === 0) return;
  const existing = rows[0];
  const existingData = (existing.data || {}) as ClientData;

  const log = {
    id: `${Date.now()}-archive`,
    timestamp: new Date().toISOString(),
    user: session.user.name ?? "Agency staff",
    action: archived ? "Client archived" : "Client restored",
    details: archived ? "Client was archived" : "Client was restored from archive"
  };

  const updatedData: ClientData = {
    ...existingData,
    auditLogs: [log, ...(existingData.auditLogs || [])]
  };

  await db.update(clients).set({
    archived,
    data: updatedData
  }).where(eq(clients.id, id));

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  revalidatePath("/requests/new");
}

export async function deleteClientAction(id: string) {
  await requireRole("agency");
  await ensureClientsTable();
  await db.delete(clients).where(eq(clients.id, id));

  revalidatePath("/clients");
  revalidatePath("/requests/new");
}

export async function addClientContactAction(clientId: string, contact: Omit<ClientContact, "id">) {
  await requireRole("agency");
  await ensureClientsTable();

  const rows = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!rows || rows.length === 0) throw new Error("Client not found");
  const existing = rows[0];
  const existingData = (existing.data || {}) as ClientData;

  const newContact: ClientContact = {
    ...contact,
    id: `c-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: contact.name.trim(),
    role: (contact.role || "").trim(),
    email: (contact.email || "").trim(),
    phone: (contact.phone || "").trim(),
  };

  let contacts = [...(existingData.contacts || [])];
  if (newContact.isDefault) {
    contacts = contacts.map(c => c.type === newContact.type ? { ...c, isDefault: false } : c);
  }
  contacts.push(newContact);

  await db.update(clients).set({
    data: {
      ...existingData,
      contacts
    }
  }).where(eq(clients.id, clientId));

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/requests/new");
}

export async function updateClientContactAction(clientId: string, contactId: string, updates: Partial<ClientContact>) {
  await requireRole("agency");
  await ensureClientsTable();

  const rows = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!rows || rows.length === 0) throw new Error("Client not found");
  const existing = rows[0];
  const existingData = (existing.data || {}) as ClientData;

  let contacts = [...(existingData.contacts || [])];
  const target = contacts.find(c => c.id === contactId);
  if (!target) return;

  if (updates.isDefault) {
    contacts = contacts.map(c => c.type === target.type ? { ...c, isDefault: false } : c);
  }

  contacts = contacts.map(c => c.id === contactId ? { ...c, ...updates } : c);

  await db.update(clients).set({
    data: {
      ...existingData,
      contacts
    }
  }).where(eq(clients.id, clientId));

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/requests/new");
}

export async function deleteClientContactAction(clientId: string, contactId: string) {
  await requireRole("agency");
  await ensureClientsTable();

  const rows = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!rows || rows.length === 0) return;
  const existing = rows[0];
  const existingData = (existing.data || {}) as ClientData;

  const contacts = (existingData.contacts || []).filter(c => c.id !== contactId);

  await db.update(clients).set({
    data: {
      ...existingData,
      contacts
    }
  }).where(eq(clients.id, clientId));

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/requests/new");
}

export async function addClientLocationAction(clientId: string, location: Omit<ClientLocation, "id">) {
  await requireRole("agency");
  await ensureClientsTable();

  const rows = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!rows || rows.length === 0) throw new Error("Client not found");
  const existing = rows[0];
  const existingData = (existing.data || {}) as ClientData;

  const newLoc: ClientLocation = {
    ...location,
    id: `loc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: location.name.trim(),
    streetAddress: (location.streetAddress || location.address || "").trim(),
    address: (location.streetAddress || location.address || "").trim(),
    roomOrSuite: (location.roomOrSuite || location.room || "").trim(),
    room: (location.roomOrSuite || location.room || "").trim(),
    parking: (location.parking || "").trim(),
    entrance: (location.entrance || "").trim(),
    checkInInstructions: (location.checkInInstructions || location.instructions || "").trim(),
    instructions: (location.checkInInstructions || location.instructions || "").trim(),
  };

  let locations = [...(existingData.locations || [])];
  if (newLoc.isDefault) {
    locations = locations.map(l => ({ ...l, isDefault: false }));
  }
  locations.push(newLoc);

  await db.update(clients).set({
    data: {
      ...existingData,
      locations
    }
  }).where(eq(clients.id, clientId));

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
}

export async function updateClientLocationAction(clientId: string, locationId: string, updates: Partial<ClientLocation>) {
  await requireRole("agency");
  await ensureClientsTable();

  const rows = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!rows || rows.length === 0) return;
  const existing = rows[0];
  const existingData = (existing.data || {}) as ClientData;

  let locations = [...(existingData.locations || [])];
  if (updates.isDefault) {
    locations = locations.map(l => ({ ...l, isDefault: false }));
  }

  locations = locations.map(l => l.id === locationId ? { ...l, ...updates } : l);

  await db.update(clients).set({
    data: {
      ...existingData,
      locations
    }
  }).where(eq(clients.id, clientId));

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteClientLocationAction(clientId: string, locationId: string) {
  await requireRole("agency");
  await ensureClientsTable();

  const rows = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!rows || rows.length === 0) return;
  const existing = rows[0];
  const existingData = (existing.data || {}) as ClientData;

  const locations = (existingData.locations || []).filter(l => l.id !== locationId);

  await db.update(clients).set({
    data: {
      ...existingData,
      locations
    }
  }).where(eq(clients.id, clientId));

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
}

/**
 * Persists an organization + contact into PostgreSQL clients table with deduplication.
 * Called when "Save this organization and contact to the agency list for future requests" is checked.
 */
export async function saveRequesterToClientsAction(payload: {
  organization: string;
  contactName: string;
  email: string;
  phone: string;
  preferredContact?: string;
}) {
  await requireRole("agency");
  await ensureClientsTable();

  const org = (payload.organization || "").trim();
  const contactName = (payload.contactName || "").trim();
  const email = (payload.email || "").trim();
  const phone = (payload.phone || "").trim();

  if (!org && !contactName) return null;

  const orgToMatch = org || contactName;

  const allClients = await db.select().from(clients);
  const matchedClient = allClients.find(
    c => c.name.trim().toLowerCase() === orgToMatch.toLowerCase()
  );

  const now = new Date().toISOString();

  if (!matchedClient) {
    // 1. Create a brand new client in PostgreSQL
    const newId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newContact: ClientContact = {
      id: `c-${Date.now()}`,
      type: "Requester contact",
      name: contactName || orgToMatch,
      role: "Requester",
      email,
      phone,
      isDefault: true,
      isArchived: false
    };

    const newClientData: ClientData = {
      generalEmail: email,
      generalPhone: phone,
      contacts: [newContact],
      locations: [],
      auditLogs: [{
        id: `${Date.now()}-created`,
        timestamp: now,
        user: "Staff",
        action: "Client created",
        details: `Saved from agency request: ${orgToMatch}`
      }]
    };

    await db.insert(clients).values({
      id: newId,
      name: orgToMatch,
      type: "organization",
      archived: false,
      data: newClientData,
      createdAt: new Date()
    });

    revalidatePath("/clients");
    revalidatePath("/requests/new");
    revalidatePath("/requests");
    return newId;
  } else {
    // 2. Existing client: Deduplicate contacts and update
    const cData = (matchedClient.data || {}) as ClientData;
    let contacts = [...(cData.contacts || [])];

    // Find contact by matching email or contact name
    const existingContactIndex = contacts.findIndex(c => {
      const emailMatch = email && c.email.trim().toLowerCase() === email.toLowerCase();
      const nameMatch = contactName && c.name.trim().toLowerCase() === contactName.toLowerCase();
      return emailMatch || nameMatch;
    });

    if (existingContactIndex > -1) {
      // Update existing contact
      contacts[existingContactIndex] = {
        ...contacts[existingContactIndex],
        name: contactName || contacts[existingContactIndex].name,
        email: email || contacts[existingContactIndex].email,
        phone: phone || contacts[existingContactIndex].phone,
        isArchived: false
      };
    } else if (contactName || email || phone) {
      // Append new contact
      contacts.push({
        id: `c-${Date.now()}`,
        type: "Requester contact",
        name: contactName || orgToMatch,
        role: "Requester",
        email,
        phone,
        isDefault: contacts.filter(c => c.type === "Requester contact" && !c.isArchived).length === 0,
        isArchived: false
      });
    }

    const updatedData: ClientData = {
      ...cData,
      generalEmail: cData.generalEmail || email,
      generalPhone: cData.generalPhone || phone,
      contacts
    };

    await db.update(clients).set({
      archived: false, // Ensure unarchived so it shows up in future requests
      data: updatedData
    }).where(eq(clients.id, matchedClient.id));

    revalidatePath("/clients");
    revalidatePath(`/clients/${matchedClient.id}`);
    revalidatePath("/requests/new");
    revalidatePath("/requests");
    return matchedClient.id;
  }
}
