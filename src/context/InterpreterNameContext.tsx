"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useSession } from "next-auth/react";

interface InterpreterNameValue {
  /** Preferred name, else the account name. */
  name: string;
  /** Show a new name at once (right after the profile is saved) and refresh the session behind the scenes. */
  setName: (name: string) => void;
}

const InterpreterNameContext = createContext<InterpreterNameValue | null>(null);

/**
 * Supplies the interpreter's display name to the workspace (sidebar, top bar, Home greeting).
 * The name comes from the session (`session.user.displayName`, resolved on the server and carried in the token), so
 * the very first paint already shows the right name. Saving the profile calls `update()`, which re-reads it.
 */
export function InterpreterNameProvider({ children }: { children: ReactNode }) {
  const { data: session, update } = useSession();
  const sessionName = session?.user?.displayName?.trim() || session?.user?.name?.trim() || "";
  // Shown until the refreshed session catches up with a name that was just saved.
  const [override, setOverride] = useState<string | null>(null);

  useEffect(() => {
    if (override !== null && sessionName === override) setOverride(null);
  }, [override, sessionName]);

  const setName = useCallback(
    (name: string) => {
      setOverride(name.trim() || null);
      void update();
    },
    [update],
  );

  const value = useMemo<InterpreterNameValue>(() => ({ name: override ?? sessionName, setName }), [override, sessionName, setName]);
  return <InterpreterNameContext.Provider value={value}>{children}</InterpreterNameContext.Provider>;
}

/** The interpreter's display name. Outside the provider it falls back to the session's name. */
export function useInterpreterName(): InterpreterNameValue {
  const ctx = useContext(InterpreterNameContext);
  const { data: session } = useSession();
  return ctx ?? { name: session?.user?.displayName?.trim() || session?.user?.name?.trim() || "", setName: () => undefined };
}
