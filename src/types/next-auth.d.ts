import type { DefaultSession } from "next-auth";
import type { AppRole } from "@/lib/auth/routes";

declare module "next-auth" {
  interface User {
    id: string;
    role: AppRole;
    /** The interpreters.id this login belongs to (interpreter role only; null if no matching profile). */
    interpreterId?: string | null;
  }

  interface Session {
    user: {
      id: string;
      role: AppRole;
      interpreterId: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: AppRole;
    interpreterId?: string | null;
  }
}
