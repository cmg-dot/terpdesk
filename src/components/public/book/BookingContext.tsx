"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

interface BookingValue {
  /** The request form's "Preferred interpreter" field (the intake's prefInterpreter). */
  preferred: string;
  setPreferred: (value: string) => void;
  /** Goes up by one on every "Request <name>" click, so the form can bring itself back and focus the field. */
  requests: number;
  requestInterpreter: (name: string) => void;
}

const BookingContext = createContext<BookingValue | null>(null);

/** Shares the preferred interpreter between the interpreter cards and the request form on the demo booking page. */
export function BookingProvider({ children }: { children: ReactNode }) {
  const [preferred, setPreferred] = useState("");
  const [requests, setRequests] = useState(0);
  const requestInterpreter = useCallback((name: string) => {
    setPreferred(name);
    setRequests((n) => n + 1);
  }, []);
  const value = useMemo(() => ({ preferred, setPreferred, requests, requestInterpreter }), [preferred, requests, requestInterpreter]);
  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking(): BookingValue {
  const value = useContext(BookingContext);
  if (!value) throw new Error("useBooking must be used inside BookingProvider");
  return value;
}
