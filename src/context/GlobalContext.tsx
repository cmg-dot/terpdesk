"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { getMyRosterAgencyIds } from "@/app/actions/getMyAgencies";
import { requestAgencyConnection } from "@/app/actions/agencyConnections";

export interface DevUser {
  id: string;
  role: 'agency' | 'interpreter';
  name?: string;
  email?: string;
  agency_id?: string;
}

// Placeholder used only while nobody is signed in (e.g. on /login); protected pages never render in this state.
const SIGNED_OUT_USER: DevUser = { id: '', role: 'agency' };

export interface Agency {
  id: string;
  name: string;
  join_code: string;
  accepts_join_requests: boolean;
}

export interface Membership {
  id: string;
  agency_id: string;
  user_id: string;
  role: 'staff' | 'interpreter';
  active: boolean;
}

export interface WebsiteProfileConsent {
  interpreter_id: string;
  agency_id: string;
  allowed: boolean;
  review_state: 'not_shared' | 'pending' | 'approved' | 'declined' | 'removed';
  approved_fields: any;
}

// Join requests and notifications live in the database (agency_interpreters, notifications), not in this context.
interface GlobalContextType {
  agencies: Agency[];
  memberships: Membership[];
  website_profile_consent: WebsiteProfileConsent[];
  currentUser: DevUser;
  /** Agencies this interpreter is already on the roster of (from the database, not just local memberships). */
  rosterAgencyIds: string[];
  requestToJoinAgency: (inputCode: string) => Promise<{ error?: string; success?: boolean }>;
  updateInterpreterProfile: (newFields: any) => void;
}

const GlobalContext = createContext<GlobalContextType | undefined>(undefined);

export function GlobalProvider({ children }: { children: ReactNode }) {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [website_profile_consent, setWebsiteProfileConsent] = useState<WebsiteProfileConsent[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [rosterAgencyIds, setRosterAgencyIds] = useState<string[]>([]);
  // The signed-in user comes from the NextAuth session (provided by the root layout).
  const { data: session } = useSession();
  const currentUser: DevUser = useMemo(() => {
    const user = session?.user;
    if (!user) return SIGNED_OUT_USER;
    return {
      id: user.role === 'interpreter' ? (user.interpreterId ?? user.id) : user.id,
      role: user.role,
      name: user.name ?? undefined,
      email: user.email ?? undefined,
      // There is a single agency in this workspace; the users table has no agency column yet.
      agency_id: user.role === 'agency' ? 'agency-1' : undefined,
    };
  }, [session]);

  // Roster links live in the database. Only interpreters have one, so only they ask.
  useEffect(() => {
    if (currentUser.role !== 'interpreter' || !currentUser.id) {
      setRosterAgencyIds([]);
      return;
    }
    getMyRosterAgencyIds().then(setRosterAgencyIds).catch(() => setRosterAgencyIds([]));
  }, [currentUser.role, currentUser.id]);

  useEffect(() => {
    try {
      const storedAgencies = localStorage.getItem('terpdesk_agencies');
      if (storedAgencies) {
        setAgencies(JSON.parse(storedAgencies));
      } else {
        const defaultAgencies: Agency[] = [
          { id: 'agency-1', name: 'North Fictional Interpreting', join_code: 'north123', accepts_join_requests: true }
        ];
        setAgencies(defaultAgencies);
        localStorage.setItem('terpdesk_agencies', JSON.stringify(defaultAgencies));
      }

      const storedMemberships = localStorage.getItem('terpdesk_memberships');
      if (storedMemberships) setMemberships(JSON.parse(storedMemberships));

      const storedConsents = localStorage.getItem('terpdesk_website_profile_consents');
      if (storedConsents) setWebsiteProfileConsent(JSON.parse(storedConsents));

      setIsLoaded(true);
    } catch (e) {
      console.error(e);
      setIsLoaded(true);
    }
  }, []);

  const save = (key: string, data: any) => {
    localStorage.setItem(key, JSON.stringify(data));
  };

  const requestToJoinAgency = async (inputCode: string): Promise<{ error?: string; success?: boolean }> => {
    const cleanedCode = inputCode.replace(/\s+/g, '').toLowerCase();
    const agency = agencies.find(a => a.join_code.replace(/\s+/g, '').toLowerCase() === cleanedCode);

    if (!agency) {
      return { error: 'Invalid join code.' };
    }

    if (!agency.accepts_join_requests) {
      return { error: 'This agency is not currently accepting join requests.' };
    }

    // The request is stored in the database as a 'pending' connection, and the server notifies the agency.
    // The server also refuses duplicates ("already connected" / "already pending"), so this cannot be bypassed.
    const result = await requestAgencyConnection(agency.id);
    if (!result.success) {
      return { error: result.error };
    }

    return { success: true };
  };

  const updateInterpreterProfile = (newFields: any) => {
    const sensitiveFields = ['display_name', 'bio', 'photo_path', 'service_area'];
    const hasSensitiveChanges = Object.keys(newFields).some(key => sensitiveFields.includes(key));

    if (hasSensitiveChanges) {
      const updatedConsents = website_profile_consent.map(consent => {
        if (consent.interpreter_id === currentUser.id && consent.review_state === 'approved') {
          return { ...consent, review_state: 'pending' as const, approved_fields: {} };
        }
        return consent;
      });
      setWebsiteProfileConsent(updatedConsents);
      save('terpdesk_website_profile_consents', updatedConsents);
    }
  };

  if (!isLoaded) return null;

  return (
    <GlobalContext.Provider value={{
      agencies,
      memberships,
      website_profile_consent,
      currentUser,
      rosterAgencyIds,
      requestToJoinAgency,
      updateInterpreterProfile
    }}>
      {children}
    </GlobalContext.Provider>
  );
}

export const useGlobalState = () => {
  const context = useContext(GlobalContext);
  if (context === undefined) {
    throw new Error('useGlobalState must be used within a GlobalProvider');
  }
  return context;
};
