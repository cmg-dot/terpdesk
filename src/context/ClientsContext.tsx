"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from "react";
import { 
  getClientsAction, 
  createClientAction, 
  updateClientAction, 
  archiveClientAction, 
  deleteClientAction,
  addClientContactAction,
  updateClientContactAction,
  deleteClientContactAction,
  addClientLocationAction,
  updateClientLocationAction,
  deleteClientLocationAction,
  type ClientWithStats
} from "@/app/actions/clients";
import type { ClientContact, ClientLocation, ClientAuditLog } from "@/db/schema";

export type ContactItem = ClientContact;
export type LocationItem = ClientLocation;
export type AuditLog = ClientAuditLog;

export interface ClientItem {
  id: string;
  name: string;
  type: string;
  contact?: string;
  stats?: string;
  contacts?: ContactItem[];
  locations?: LocationItem[];
  isArchived?: boolean;
  generalEmail?: string;
  generalPhone?: string;
  billingOrg?: string;
  billingAddress?: string;
  privateNotes?: string;
  auditLogs?: AuditLog[];
  linkedJobsCount?: number;
}

interface ClientsContextType {
  clients: ClientItem[];
  isLoading: boolean;
  refreshClients: () => Promise<void>;
  addClient: (client: { id?: string; name: string; type?: string; generalEmail?: string; generalPhone?: string; billingOrg?: string; billingAddress?: string; privateNotes?: string }) => Promise<string>;
  updateClient: (clientId: string, updates: Partial<ClientItem>) => Promise<void>;
  archiveClient: (clientId: string) => Promise<void>;
  restoreClient: (clientId: string) => Promise<void>;
  deleteClient: (clientId: string) => Promise<void>;
  addContact: (clientId: string, newContact: ContactItem) => Promise<void>;
  archiveContact: (clientId: string, contactId: string) => Promise<void>;
  restoreContact: (clientId: string, contactId: string) => Promise<void>;
  deleteContact: (clientId: string, contactId: string) => Promise<void>;
  makeContactDefault: (clientId: string, contactId: string) => Promise<void>;
  addLocation: (clientId: string, newLocation: LocationItem) => Promise<void>;
  archiveLocation: (clientId: string, locationId: string) => Promise<void>;
  restoreLocation: (clientId: string, locationId: string) => Promise<void>;
  deleteLocation: (clientId: string, locationId: string) => Promise<void>;
  makeLocationDefault: (clientId: string, locationId: string) => Promise<void>;
}

const ClientsContext = createContext<ClientsContextType | undefined>(undefined);

export function ClientsProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchFromDb = useCallback(async () => {
    try {
      const dbClients = await getClientsAction();
      const mapped: ClientItem[] = dbClients.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        contact: c.contactSummary,
        stats: c.stats,
        contacts: c.contacts,
        locations: c.locations,
        isArchived: c.isArchived,
        generalEmail: c.generalEmail,
        generalPhone: c.generalPhone,
        billingOrg: c.billingOrg,
        billingAddress: c.billingAddress,
        privateNotes: c.privateNotes,
        auditLogs: c.auditLogs,
        linkedJobsCount: c.linkedJobsCount
      }));
      setClients(mapped);
    } catch (err) {
      console.error("Failed to load clients from PostgreSQL:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFromDb();
  }, [fetchFromDb]);

  const addClient = async (clientData: {
    id?: string;
    name: string;
    type?: string;
    generalEmail?: string;
    generalPhone?: string;
    billingOrg?: string;
    billingAddress?: string;
    privateNotes?: string;
  }): Promise<string> => {
    const createdId = await createClientAction({
      name: clientData.name,
      type: clientData.type || "organization",
      generalEmail: clientData.generalEmail,
      generalPhone: clientData.generalPhone,
      billingOrganization: clientData.billingOrg,
      billingAddress: clientData.billingAddress,
      privateNotes: clientData.privateNotes
    });

    await fetchFromDb();
    return createdId;
  };

  const updateClient = async (clientId: string, updates: Partial<ClientItem>) => {
    // Optimistic update
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, ...updates } : c));

    await updateClientAction(clientId, {
      name: updates.name,
      type: updates.type,
      archived: updates.isArchived,
      generalEmail: updates.generalEmail,
      generalPhone: updates.generalPhone,
      billingOrganization: updates.billingOrg,
      billingOrg: updates.billingOrg,
      billingAddress: updates.billingAddress,
      privateNotes: updates.privateNotes
    });

    await fetchFromDb();
  };

  const archiveClient = async (clientId: string) => {
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, isArchived: true } : c));
    await archiveClientAction(clientId, true);
    await fetchFromDb();
  };

  const restoreClient = async (clientId: string) => {
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, isArchived: false } : c));
    await archiveClientAction(clientId, false);
    await fetchFromDb();
  };

  const deleteClient = async (clientId: string) => {
    setClients(prev => prev.filter(c => c.id !== clientId));
    await deleteClientAction(clientId);
    await fetchFromDb();
  };

  const addContact = async (clientId: string, newContact: ContactItem) => {
    await addClientContactAction(clientId, {
      type: newContact.type,
      name: newContact.name,
      role: newContact.role,
      email: newContact.email,
      phone: newContact.phone,
      isDefault: newContact.isDefault,
      isArchived: false
    });
    await fetchFromDb();
  };

  const archiveContact = async (clientId: string, contactId: string) => {
    await updateClientContactAction(clientId, contactId, { isArchived: true, isDefault: false });
    await fetchFromDb();
  };

  const restoreContact = async (clientId: string, contactId: string) => {
    await updateClientContactAction(clientId, contactId, { isArchived: false });
    await fetchFromDb();
  };

  const deleteContact = async (clientId: string, contactId: string) => {
    await deleteClientContactAction(clientId, contactId);
    await fetchFromDb();
  };

  const makeContactDefault = async (clientId: string, contactId: string) => {
    await updateClientContactAction(clientId, contactId, { isDefault: true });
    await fetchFromDb();
  };

  const addLocation = async (clientId: string, newLocation: LocationItem) => {
    await addClientLocationAction(clientId, {
      name: newLocation.name,
      streetAddress: newLocation.streetAddress || newLocation.address || "",
      address: newLocation.streetAddress || newLocation.address || "",
      roomOrSuite: newLocation.roomOrSuite || newLocation.room || "",
      room: newLocation.roomOrSuite || newLocation.room || "",
      parking: newLocation.parking || "",
      entrance: newLocation.entrance || "",
      checkInInstructions: newLocation.checkInInstructions || newLocation.instructions || "",
      instructions: newLocation.checkInInstructions || newLocation.instructions || "",
      isDefault: newLocation.isDefault,
      isArchived: false
    });
    await fetchFromDb();
  };

  const archiveLocation = async (clientId: string, locationId: string) => {
    await updateClientLocationAction(clientId, locationId, { isArchived: true, isDefault: false });
    await fetchFromDb();
  };

  const restoreLocation = async (clientId: string, locationId: string) => {
    await updateClientLocationAction(clientId, locationId, { isArchived: false });
    await fetchFromDb();
  };

  const deleteLocation = async (clientId: string, locationId: string) => {
    await deleteClientLocationAction(clientId, locationId);
    await fetchFromDb();
  };

  const makeLocationDefault = async (clientId: string, locationId: string) => {
    await updateClientLocationAction(clientId, locationId, { isDefault: true });
    await fetchFromDb();
  };

  return (
    <ClientsContext.Provider value={{ 
      clients,
      isLoading,
      refreshClients: fetchFromDb,
      addClient, 
      updateClient,
      archiveClient,
      restoreClient,
      deleteClient,
      addContact, 
      archiveContact, 
      restoreContact,
      deleteContact,
      makeContactDefault, 
      addLocation, 
      archiveLocation, 
      restoreLocation,
      deleteLocation,
      makeLocationDefault 
    }}>
      {children}
    </ClientsContext.Provider>
  );
}

export function useClients() {
  const context = useContext(ClientsContext);
  if (context === undefined) {
    throw new Error("useClients must be used within a ClientsProvider");
  }
  return context;
}
