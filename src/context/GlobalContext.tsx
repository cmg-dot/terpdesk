"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { getMyRosterAgencyIds } from "@/app/actions/getMyAgencies";

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

export interface MembershipRequest {
  id: string;
  agency_id: string;
  interpreter_id: string;
  state: 'pending' | 'approved' | 'declined' | 'withdrawn';
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

export interface AppNotification {
  id: string;
  recipient_id: string;
  agency_id: string;
  kind: string;
  title: string;
  body: string;
  appointment_id?: string;
  href?: string;
  dedupe_key?: string;
  created_at: string;
  read_at: string | null;
}

interface GlobalContextType {
  agencies: Agency[];
  membership_requests: MembershipRequest[];
  memberships: Membership[];
  website_profile_consent: WebsiteProfileConsent[];
  notifications: AppNotification[];
  currentUser: DevUser;
  /** Agencies this interpreter is already on the roster of (from the database, not just local memberships). */
  rosterAgencyIds: string[];
  requestToJoinAgency: (inputCode: string) => { error?: string; success?: boolean };
  approveMembershipRequest: (requestId: string) => void;
  declineMembershipRequest: (requestId: string) => void;
  updateInterpreterProfile: (newFields: any) => void;
  markNotificationAsRead: (notificationId: string) => void;
}

const GlobalContext = createContext<GlobalContextType | undefined>(undefined);

export function GlobalProvider({ children }: { children: ReactNode }) {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [membership_requests, setMembershipRequests] = useState<MembershipRequest[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [website_profile_consent, setWebsiteProfileConsent] = useState<WebsiteProfileConsent[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
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

      const storedReqs = localStorage.getItem('terpdesk_membership_requests');
      if (storedReqs) setMembershipRequests(JSON.parse(storedReqs));

      const storedMemberships = localStorage.getItem('terpdesk_memberships');
      if (storedMemberships) setMemberships(JSON.parse(storedMemberships));

      const storedConsents = localStorage.getItem('terpdesk_website_profile_consents');
      if (storedConsents) setWebsiteProfileConsent(JSON.parse(storedConsents));

      const loadNotifications = () => {
        const storedNotifications = localStorage.getItem('terpdesk_notifications');
        if (storedNotifications) setNotifications(JSON.parse(storedNotifications));
      };
      loadNotifications();

      const handleStorage = (e: StorageEvent) => {
        if (e.key === 'terpdesk_notifications') {
          loadNotifications();
        }
      };
      window.addEventListener('storage', handleStorage);
      
      setIsLoaded(true);
      return () => window.removeEventListener('storage', handleStorage);
    } catch (e) {
      console.error(e);
      setIsLoaded(true);
    }
  }, []);

  const save = (key: string, data: any) => {
    localStorage.setItem(key, JSON.stringify(data));
  };

  const sendNotification = (payload: Omit<AppNotification, 'id' | 'created_at' | 'read_at'>) => {
    const newNotif: AppNotification = {
      ...payload,
      id: Math.random().toString(36).substring(7),
      created_at: new Date().toISOString(),
      read_at: null
    };
    setNotifications(prev => {
      const updated = [newNotif, ...prev];
      save('terpdesk_notifications', updated);
      return updated;
    });
  };

  const markNotificationAsRead = (notificationId: string) => {
    setNotifications(prev => {
      const updated = prev.map(n => n.id === notificationId ? { ...n, read_at: new Date().toISOString() } : n);
      save('terpdesk_notifications', updated);
      return updated;
    });
  };

  const requestToJoinAgency = (inputCode: string) => {
    const cleanedCode = inputCode.replace(/\s+/g, '').toLowerCase();
    const agency = agencies.find(a => a.join_code.replace(/\s+/g, '').toLowerCase() === cleanedCode);

    if (!agency) {
      return { error: 'Invalid join code.' };
    }

    if (!agency.accepts_join_requests) {
      return { error: 'This agency is not currently accepting join requests.' };
    }

    const hasPending = membership_requests.some(
      r => r.interpreter_id === currentUser.id && r.agency_id === agency.id && r.state === 'pending'
    );
    if (hasPending) {
      return { error: 'You already have a pending request for this agency.' };
    }

    const isConnected =
      rosterAgencyIds.includes(agency.id) ||
      memberships.some(m => m.user_id === currentUser.id && m.agency_id === agency.id && m.active);
    if (isConnected) {
      return { error: 'You are already connected to this agency.' };
    }

    const newRequest: MembershipRequest = {
      id: Math.random().toString(36).substring(7),
      agency_id: agency.id,
      interpreter_id: currentUser.id,
      state: 'pending'
    };
    const updated = [...membership_requests, newRequest];
    setMembershipRequests(updated);
    save('terpdesk_membership_requests', updated);

    sendNotification({
      recipient_id: agency.id,
      agency_id: agency.id,
      kind: 'join_request',
      title: 'New Join Request',
      body: 'A new interpreter has requested to join your roster.',
      href: '/interpreters'
    });

    return { success: true };
  };

  const approveMembershipRequest = (requestId: string) => {
    const requestIndex = membership_requests.findIndex(r => r.id === requestId);
    if (requestIndex > -1) {
      const request = membership_requests[requestIndex];
      const updatedRequests = [...membership_requests];
      updatedRequests[requestIndex] = { ...request, state: 'approved' };
      setMembershipRequests(updatedRequests);
      save('terpdesk_membership_requests', updatedRequests);

      const newMembership: Membership = {
        id: Math.random().toString(36).substring(7),
        agency_id: request.agency_id,
        user_id: request.interpreter_id,
        role: 'interpreter',
        active: true
      };
      const updatedMemberships = [...memberships, newMembership];
      setMemberships(updatedMemberships);
      save('terpdesk_memberships', updatedMemberships);

      sendNotification({
        recipient_id: request.interpreter_id,
        agency_id: request.agency_id,
        kind: 'join_decision',
        title: 'Agency Request Approved',
        body: 'You have been approved to join the agency roster.',
        href: '/agencies'
      });
    }
  };

  const declineMembershipRequest = (requestId: string) => {
    const requestIndex = membership_requests.findIndex(r => r.id === requestId);
    if (requestIndex > -1) {
      const request = membership_requests[requestIndex];
      const updatedRequests = [...membership_requests];
      updatedRequests[requestIndex] = { ...request, state: 'declined' };
      setMembershipRequests(updatedRequests);
      save('terpdesk_membership_requests', updatedRequests);

      sendNotification({
        recipient_id: request.interpreter_id,
        agency_id: request.agency_id,
        kind: 'join_decision',
        title: 'Agency Request Declined',
        body: 'Your request to join the agency was declined.',
        href: '/agencies'
      });
    }
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
      membership_requests,
      memberships,
      website_profile_consent,
      notifications,
      currentUser,
      rosterAgencyIds,
      requestToJoinAgency,
      approveMembershipRequest,
      declineMembershipRequest,
      updateInterpreterProfile,
      markNotificationAsRead
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
