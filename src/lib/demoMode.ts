import type { AppRole } from "@/lib/auth/routes";

/**
 * The demo is a separate deployment on its own database (terpdesk_demo) that sets NEXT_PUBLIC_DEMO_MODE=true; production never
 * does. Every value is a literal `process.env.NEXT_PUBLIC_...` read, so Next inlines it into the browser bundle. Pure.
 */
export const IS_DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

/** Where the sign-in pages' "Explore the demo" link goes: the demo deployment's address, else the agency sign-in. */
export const DEMO_ENTRY_URL = process.env.NEXT_PUBLIC_DEMO_URL?.trim() || "/login/agency";

export interface DemoLogin {
  email: string;
  password: string;
}

const DEFAULT_DEMO_AGENCY_EMAIL = "demo@myterpdesk.com";

/**
 * The sandbox login a portal offers to fill in, or null outside demo mode. The password is never written in the code: without
 * NEXT_PUBLIC_DEMO_PASSWORD nothing is offered.
 */
export function demoLoginFor(portal: AppRole): DemoLogin | null {
  if (!IS_DEMO_MODE) return null;
  const password = process.env.NEXT_PUBLIC_DEMO_PASSWORD?.trim();
  const email =
    portal === "agency"
      ? process.env.NEXT_PUBLIC_DEMO_AGENCY_EMAIL?.trim() || DEFAULT_DEMO_AGENCY_EMAIL
      : process.env.NEXT_PUBLIC_DEMO_INTERPRETER_EMAIL?.trim();
  return email && password ? { email, password } : null;
}
