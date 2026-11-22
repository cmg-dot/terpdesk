"use client";

import { useSession } from "next-auth/react";
import { IdleWarningDialog } from "@/components/auth/IdleWarningDialog";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";
import { isIdleRole } from "@/lib/auth/idle";

const ActiveGuard = () => {
  const { warning, remainingSec, stay, signOutNow } = useIdleTimeout();
  return <IdleWarningDialog open={warning} remainingSec={remainingSec} onStay={stay} onSignOut={signOutNow} />;
};

/**
 * Mounted once in each workspace layout (agency and interpreter). It governs signed-in logins only: with no login it renders
 * nothing and attaches nothing, so the public pages and the emailed token pages are never affected.
 */
export const IdleTimeoutGuard = () => {
  const { data: session } = useSession();
  return isIdleRole(session?.user?.role) ? <ActiveGuard /> : null;
};
