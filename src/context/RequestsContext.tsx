"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";

export interface RequestItem {
  id: string;
  title: string;
  dateString: string;
  status: string;
  setting: string;
  actionRequired: boolean;
  timestamp: number;
  overview?: any;
  details?: any;
  onsite?: any;
  requester?: any;
  prepNotes?: string;
  privateNotes?: string;
  activity?: string;
  location?: string;
  organization?: string;
  format?: string;
  pendingOffer?: boolean | string;
  serviceRecordState?: string;
  startsAt?: string;
  endsAt?: string;
  state?: 'draft' | 'cancelled' | 'active';
  slots?: any[];
  offers?: any[];
  requiredPositions?: number;
  acceptedInterpretersCount?: number;
  positions?: string;
  data?: any;
}

interface RequestsContextType {
  requests: RequestItem[];
  addRequest: (request: RequestItem) => void;
  updateRequest: (id: string, request: Partial<RequestItem>) => void;
}

const defaultRequests: RequestItem[] = [];

const RequestsContext = createContext<RequestsContextType | undefined>(undefined);

export function RequestsProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<RequestItem[]>(defaultRequests);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("terpdesk_requests");
    if (saved) {
      try {
        setRequests(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse requests from local storage");
      }
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem("terpdesk_requests", JSON.stringify(requests));
    }
  }, [requests, isLoaded]);

  const addRequest = (request: RequestItem) => {
    setRequests((prev) => [request, ...prev].sort((a, b) => b.timestamp - a.timestamp));
  };

  const updateRequest = (id: string, updatedData: Partial<RequestItem>) => {
    setRequests((prev) => prev.map(req => req.id === id ? { ...req, ...updatedData } : req));
  };

  if (!isLoaded) return null;

  return (
    <RequestsContext.Provider value={{ requests, addRequest, updateRequest }}>
      {children}
    </RequestsContext.Provider>
  );
}

export function useRequests() {
  const context = useContext(RequestsContext);
  if (context === undefined) {
    throw new Error("useRequests must be used within a RequestsProvider");
  }
  return context;
}
