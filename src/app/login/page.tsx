import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, UserRound } from "lucide-react";
import { LoginShell } from "@/components/auth/LoginShell";
import { loginPathForRole, requiredRoleForPath } from "@/lib/auth/routes";

export const metadata: Metadata = { title: "Sign in | terpDESK" };

type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/**
 * /login only picks a portal. Links that already say where they lead go straight to the right one: a callbackUrl to
 * an agency or interpreter page, and the "account created" notice after interpreter sign-up.
 */
export default function LoginChooserPage({ searchParams }: { searchParams: SearchParams }) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    const v = first(value);
    if (v !== undefined) query.set(key, v);
  }
  const qs = query.toString() ? `?${query.toString()}` : "";

  const callback = first(searchParams.callbackUrl);
  const callbackRole = callback?.startsWith("/") && !callback.startsWith("//") ? requiredRoleForPath(callback.split("?")[0]) : null;
  if (callbackRole) redirect(`${loginPathForRole(callbackRole)}${qs}`);
  if (first(searchParams.registered) === "true") redirect(`${loginPathForRole("interpreter")}${qs}`);

  const option = "flex items-center gap-4 rounded-2xl border border-neutral-200 p-4 transition-colors hover:border-[var(--forest)] hover:bg-neutral-50";
  return (
    <LoginShell title="Sign in" subtitle="Choose how you use terpDESK.">
      <nav aria-label="Sign-in portals" className="space-y-3">
        <Link href={loginPathForRole("agency")} className={option}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E6EFEA] text-[var(--forest)]">
            <Building2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-[var(--ink)]">Agency</span>
            <span className="block text-xs text-[var(--sage)]">Agency owners and staff</span>
          </span>
        </Link>
        <Link href={loginPathForRole("interpreter")} className={option}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E6EFEA] text-[var(--forest)]">
            <UserRound className="h-5 w-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-[var(--ink)]">Interpreter</span>
            <span className="block text-xs text-[var(--sage)]">Independent and agency interpreters</span>
          </span>
        </Link>
      </nav>
    </LoginShell>
  );
}
