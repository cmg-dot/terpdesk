"use client";

import { signOut } from "next-auth/react";
import type { ReactNode } from "react";

export const SignOutButton = ({ className, children }: { className?: string; children?: ReactNode }) => (
  <button type="button" onClick={() => void signOut({ callbackUrl: "/login" })} className={className}>
    {children ?? "Sign out"}
  </button>
);
