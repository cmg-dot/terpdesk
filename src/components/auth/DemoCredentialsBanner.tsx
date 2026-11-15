"use client";

import { FlaskConical } from "lucide-react";
import type { AppRole } from "@/lib/auth/routes";
import { demoLoginFor } from "@/lib/demoMode";
import type { DemoLogin } from "@/lib/demoMode";

/**
 * Demo deployment only: the sandbox login for this portal, with a button that fills it into the form. Renders nothing elsewhere
 * (see lib/demoMode.ts), so production's sign-in pages are unchanged.
 */
export function DemoCredentialsBanner({ portal, disabled, onUse }: { portal: AppRole; disabled: boolean; onUse: (login: DemoLogin) => void }) {
  const login = demoLoginFor(portal);
  if (!login) return null;

  return (
    <aside aria-label="Demo sandbox login" className="mb-5 rounded-xl border border-[rgb(var(--forest-rgb)/0.18)] bg-[rgb(var(--forest-rgb)/0.05)] px-4 py-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--forest)]">
        <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
        Demo sandbox · fictional data
      </p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-[var(--sage)]">Email</dt>
        <dd className="truncate font-mono text-[var(--ink)]">{login.email}</dd>
        <dt className="text-[var(--sage)]">Password</dt>
        <dd className="font-mono text-[var(--ink)]">{login.password}</dd>
      </dl>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onUse(login)}
        className="mt-3 rounded-full border border-[rgb(var(--forest-rgb)/0.3)] bg-white px-3.5 py-1.5 text-xs font-medium text-[var(--forest)] transition-colors hover:bg-[rgb(var(--forest-rgb)/0.08)] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--forest-rgb)/0.4)] disabled:opacity-50"
      >
        Use demo account
      </button>
    </aside>
  );
}
