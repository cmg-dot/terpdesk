import type { DefaultSession } from "next-auth";
import type { AppRole } from "@/lib/auth/routes";
import type { ThemeId } from "@/lib/theme";

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
      /** The name to show: an interpreter's preferred name, else the account name. Refreshed by `update()`. */
      displayName: string;
      /** The workspace theme: the saved choice for agency staff, always "default" for interpreters. Refreshed by `update()`. */
      theme: ThemeId;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: AppRole;
    interpreterId?: string | null;
    /** Cached display name; undefined means "look it up". */
    displayName?: string;
    /** Cached saved theme (agency only); undefined means "look it up". */
    theme?: ThemeId;
  }
}
