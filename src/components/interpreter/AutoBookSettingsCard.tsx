"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { getMyRosterAgencyIds } from "@/app/actions/getMyAgencies";
import { useGlobalState } from "@/context/GlobalContext";
import { useAgencyPermissions } from "@/hooks/useAgencyPermissions";

/**
 * Settings → Auto-book: per agency, allow it to book you directly (no offer to accept) for virtual jobs that sit inside the
 * availability you share and clash with nothing on your schedule. The same switch as on the Agencies page; it needs availability
 * sharing on for that agency first.
 */
export function AutoBookSettingsCard() {
  const { agencies } = useGlobalState();
  const [agencyIds, setAgencyIds] = useState<string[] | null>(null);
  const { permissionFor, pendingKey, error, setAutoBook } = useAgencyPermissions(true);

  useEffect(() => {
    getMyRosterAgencyIds().then(setAgencyIds).catch(() => setAgencyIds([]));
  }, []);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6" data-auto-book-settings="">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--ink)]">
        <Zap className="h-4 w-4 text-[var(--forest)]" aria-hidden="true" />
        Auto-book
      </h2>
      <p className="mt-1 text-[14px] text-[var(--sage)]">
        Let an agency book you directly, with no offer to accept, for virtual jobs that sit entirely inside the availability you share and
        clash with nothing on your schedule. You are told in the app and by email each time. In-person work still comes as an offer.
      </p>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {agencyIds === null ? null : agencyIds.length === 0 ? (
        <p className="mt-4 text-[14px] text-[var(--sage)]">You are not on any agency&apos;s roster yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-100">
          {agencyIds.map((agencyId) => {
            const perm = permissionFor(agencyId);
            const name = agencies.find((a) => a.id === agencyId)?.name ?? "This agency";
            const saving = pendingKey === `auto:${agencyId}`;
            return (
              <li key={agencyId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-[14px] font-medium text-[var(--ink)]">{name}</span>
                <div className="flex flex-wrap items-center gap-3">
                  {!perm.sharesAvailability && (
                    <Link href="/agencies" className="text-[13px] text-[var(--sage)] underline underline-offset-2">Share your availability first</Link>
                  )}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={perm.allowsAutoBook}
                    onClick={() => setAutoBook(agencyId, !perm.allowsAutoBook)}
                    disabled={!perm.sharesAvailability || Boolean(pendingKey)}
                    className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-50 ${perm.allowsAutoBook ? "bg-[var(--forest)] text-white" : "border border-gray-200 text-slate-600 hover:bg-gray-50"}`}
                  >
                    {saving ? "Saving…" : perm.allowsAutoBook ? "Auto-book on" : "Auto-book off"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
