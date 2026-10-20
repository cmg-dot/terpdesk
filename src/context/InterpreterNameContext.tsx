"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useSession } from "next-auth/react";
import { getMyDisplayName } from "@/app/actions/myDisplayName";

interface InterpreterNameValue {
  /** Preferred name, else the account name. */
  name: string;
  /** Show a new name at once (e.g. right after the profile is saved). */
  setName: (name: string) => void;
}

const InterpreterNameContext = createContext<InterpreterNameValue | null>(null);

/** Supplies the interpreter's display name to the workspace (sidebar, top bar, Home greeting). */
export function InterpreterNameProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const accountName = session?.user?.name?.trim() ?? "";
  const [preferred, setPreferred] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const name = await getMyDisplayName();
      setPreferred(name?.trim() || null);
    } catch {
      // Keep the account name.
    }
  }, []);

  // Re-read when the session changes (sign-in, or the profile getting linked after email verification).
  useEffect(() => {
    if (status === "authenticated") void load();
  }, [status, session?.user?.interpreterId, load]);

  const value = useMemo<InterpreterNameValue>(
    () => ({ name: preferred || accountName, setName: (name: string) => setPreferred(name.trim() || null) }),
    [preferred, accountName],
  );

  return <InterpreterNameContext.Provider value={value}>{children}</InterpreterNameContext.Provider>;
}

/** The interpreter's display name. Outside the provider it falls back to the session's account name. */
export function useInterpreterName(): InterpreterNameValue {
  const ctx = useContext(InterpreterNameContext);
  const { data: session } = useSession();
  return ctx ?? { name: session?.user?.name?.trim() ?? "", setName: () => undefined };
}
