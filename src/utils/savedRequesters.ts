import { saveRequesterToClientsAction } from "@/app/actions/clients";

export interface SavedAgencyRequester {
  id: string;
  organization: string;
  contactName: string;
  email: string;
  phone: string;
  preferredContact: string;
  updatedAt?: string;
}

export const DEFAULT_SAVED_REQUESTERS: SavedAgencyRequester[] = [];

const STORAGE_KEY = "terpdesk_saved_requesters";

export function getSavedAgencyRequesters(): SavedAgencyRequester[] {
  if (typeof window === "undefined") {
    return DEFAULT_SAVED_REQUESTERS;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SAVED_REQUESTERS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Filter out any stale dummy entries from previous test runs
      return parsed.filter(item => 
        !["fictional clinic", "freshflow healthcare", "harborview medical center"].includes(
          (item.organization || "").trim().toLowerCase()
        )
      );
    }
    return DEFAULT_SAVED_REQUESTERS;
  } catch (e) {
    console.error("Failed to read saved agency requesters", e);
    return DEFAULT_SAVED_REQUESTERS;
  }
}

export function saveAgencyRequester(entry: {
  organization: string;
  contactName: string;
  email: string;
  phone: string;
  preferredContact?: string;
  id?: string;
}): SavedAgencyRequester[] {
  const org = (entry.organization || "").trim();
  const contact = (entry.contactName || "").trim();
  const email = (entry.email || "").trim();
  const phone = (entry.phone || "").trim();
  const preferredContact = (entry.preferredContact || "No preference given").trim();

  // Also sync to PostgreSQL via server action asynchronously
  if (org || contact) {
    saveRequesterToClientsAction({
      organization: org,
      contactName: contact,
      email,
      phone,
      preferredContact
    }).catch(err => {
      console.error("Failed to sync requester to PostgreSQL:", err);
    });
  }

  if (typeof window === "undefined") return [];

  // If both organization and contactName are empty, skip saving
  if (!org && !contact) {
    return getSavedAgencyRequesters();
  }

  const list = [...getSavedAgencyRequesters()];

  // Deduplication: match by same organization + email, or same org + contact name
  const existingIndex = list.findIndex(item => {
    const orgMatch = item.organization.trim().toLowerCase() === org.toLowerCase();
    const emailMatch = email && item.email.trim().toLowerCase() === email.toLowerCase();
    const contactMatch = contact && item.contactName.trim().toLowerCase() === contact.toLowerCase();
    return (orgMatch && emailMatch) || (orgMatch && contactMatch);
  });

  const now = new Date().toISOString();

  if (existingIndex > -1) {
    list[existingIndex] = {
      ...list[existingIndex],
      organization: org || list[existingIndex].organization,
      contactName: contact || list[existingIndex].contactName,
      email: email || list[existingIndex].email,
      phone: phone || list[existingIndex].phone,
      preferredContact: preferredContact || list[existingIndex].preferredContact,
      updatedAt: now,
    };
  } else {
    const newEntry: SavedAgencyRequester = {
      id: entry.id || `req-${Date.now()}`,
      organization: org,
      contactName: contact,
      email,
      phone,
      preferredContact,
      updatedAt: now,
    };
    list.unshift(newEntry);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error("Failed to persist saved agency requester", e);
  }

  return list;
}

export function formatRequesterLabel(requester: { organization?: string; contactName?: string; name?: string }): string {
  const org = requester.organization || "";
  const contact = requester.contactName || requester.name || "";
  if (org && contact && org !== contact) {
    return `${org} · ${contact}`;
  }
  return org || contact || "Saved contact";
}
