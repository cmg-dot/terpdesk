"use client";

import { useSession } from "next-auth/react";
import { IdleWarningDialog } from "@/components/auth/IdleWarningDialog";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";

const ActiveGuard = () => {
  const { warning, remainingSec, stay, signOutNow } = useIdleTimeout();
  return <IdleWarningDialog open={warning} remainingSec={remainingSec} onStay={stay} onSignOut={signOutNow} />;
};

/**
 * Mounted once in the agency workspace layout. It governs agency staff only: for any other login (or none) it renders
 * nothing and attaches nothing, so interpreters and the public token pages are never affected.
 */
export const IdleTimeoutGuard = () => {
  const { data: session } = useSession();
  return session?.user?.role === "agency" ? <ActiveGuard /> : null;
};
