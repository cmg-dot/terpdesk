"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { MascotMood } from "@/lib/mascotPoses";
import type { AppRole } from "@/lib/auth/routes";

/** What the sign-in mascot is doing follows the form: which field has focus, the code step, a refusal, a successful sign-in. */
interface MascotContextValue {
  mood: MascotMood;
  /** The portal the form belongs to, while the mood is "wrongPortal" (the bubble names the other one). */
  portal: AppRole | null;
  setMood: (mood: MascotMood, portal?: AppRole) => void;
}

const MascotContext = createContext<MascotContextValue | null>(null);
const noop = () => undefined;

/** Shared by the form (which sets the mood) and the mascot and its speech bubble (which show it); they sit in different panels. */
export const LoginMascotProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<{ mood: MascotMood; portal: AppRole | null }>({ mood: "idle", portal: null });
  const setMood = useCallback((mood: MascotMood, portal?: AppRole) => {
    setState((prev) => (prev.mood === mood && prev.portal === (portal ?? null) ? prev : { mood, portal: portal ?? null }));
  }, []);
  const value = useMemo(() => ({ ...state, setMood }), [state, setMood]);
  return <MascotContext.Provider value={value}>{children}</MascotContext.Provider>;
};

export const useMascotMood = (): MascotMood => useContext(MascotContext)?.mood ?? "idle";

/** The mood with the portal it concerns (for the wrong-portal bubble). */
export const useMascotHint = (): { mood: MascotMood; portal: AppRole | null } => {
  const ctx = useContext(MascotContext);
  return { mood: ctx?.mood ?? "idle", portal: ctx?.portal ?? null };
};

/** Outside a sign-in page (no provider) this does nothing, so the form also works on its own. */
export const useSetMascotMood = (): ((mood: MascotMood, portal?: AppRole) => void) => useContext(MascotContext)?.setMood ?? noop;
