"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import type { ReactNode } from "react";

/** Client wrapper so the root (server) layout can hand the already-resolved session to `useSession()`. */
export const SessionProvider = ({ session, children }: { session: Session | null; children: ReactNode }) => (
  <NextAuthSessionProvider session={session}>{children}</NextAuthSessionProvider>
);
