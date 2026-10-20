"use client";

import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Award, Plus } from "lucide-react";
import { ArchivedCredentialCard } from "@/components/profile/ArchivedCredentialCard";
import { CredentialCard } from "@/components/profile/CredentialCard";
import { CredentialForm } from "@/components/profile/CredentialForm";
import { useGlobalState } from "@/context/GlobalContext";
import type { MyCredential } from "@/lib/validation/credential";

interface CredentialsTabProps {
  /** Active and archived credentials together; the tab splits them. */
  credentials: MyCredential[];
  /** A state setter, so rapid changes (e.g. optimistic sharing, then the server's answer) never use a stale list. */
  onChange: Dispatch<SetStateAction<MyCredential[]>>;
  /** Agencies the interpreter is connected to (from approved roster rows). */
  connectedAgencyIds: string[];
  /** The interpreter's profile time zone, for expiry badges. */
  timeZone: string;
}

const byName = (a: MyCredential, b: MyCredential) => a.name.localeCompare(b.name);

/** "My Profile" Credentials tab: active credentials with sharing, and an Archived section when there are any. */
export const CredentialsTab = ({ credentials, onChange, connectedAgencyIds, timeZone }: CredentialsTabProps) => {
  const { agencies: knownAgencies } = useGlobalState();
  // null = list view; "new" = add form; otherwise the id being edited.
  const [formFor, setFormFor] = useState<"new" | string | null>(null);

  // Agencies are not stored in the database yet, so names come from the app's agency list.
  const agencies = useMemo(
    () => connectedAgencyIds.map((id) => ({ id, name: knownAgencies.find((a) => a.id === id)?.name ?? "Agency" })),
    [connectedAgencyIds, knownAgencies],
  );

  const active = useMemo(() => credentials.filter((c) => !c.isArchived), [credentials]);
  const archived = useMemo(() => credentials.filter((c) => c.isArchived), [credentials]);

  const replace = (updated: MyCredential) =>
    onChange((list) => list.map((c) => (c.id === updated.id ? updated : c)).sort(byName));

  if (formFor) {
    const editing = formFor === "new" ? undefined : active.find((c) => c.id === formFor);
    return (
      <CredentialForm
        key={formFor}
        initial={editing}
        onCancel={() => setFormFor(null)}
        onSaved={(saved) => {
          if (editing) replace(saved);
          else onChange((list) => [...list, saved].sort(byName));
          setFormFor(null);
        }}
      />
    );
  }

  const addButton = (
    <button
      type="button"
      onClick={() => setFormFor("new")}
      className="inline-flex items-center gap-2 rounded-full bg-[#0B3B32] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#082a23]"
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      Add a credential
    </button>
  );

  return (
    <div className="space-y-8">
      {active.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
          <Award className="mx-auto mb-3 h-8 w-8 text-gray-300" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-[var(--ink)]">Nothing listed yet</h2>
          <p className="mx-auto mb-6 mt-1 max-w-md text-sm text-[var(--sage)]">
            Add your certifications, qualifications, training and insurance so agencies know what you hold.
          </p>
          {addButton}
        </div>
      ) : (
        <section aria-labelledby="active-credentials" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id="active-credentials" className="text-lg font-semibold text-[var(--ink)]">
              Active ({active.length})
            </h2>
            {addButton}
          </div>
          <ul className="space-y-4">
            {active.map((c) => (
              <CredentialCard
                key={c.id}
                credential={c}
                agencies={agencies}
                timeZone={timeZone}
                onEdit={() => setFormFor(c.id)}
                // Archiving clears the credential's shares on the server, so mirror that here.
                onArchived={() => replace({ ...c, isArchived: true, shares: [] })}
                onSharesChange={(shares) => onChange((list) => list.map((x) => (x.id === c.id ? { ...x, shares } : x)))}
                onFilesChange={(files) => onChange((list) => list.map((x) => (x.id === c.id ? { ...x, files } : x)))}
              />
            ))}
          </ul>
        </section>
      )}

      {archived.length > 0 && (
        <section aria-labelledby="archived-credentials" className="space-y-4">
          <div className="space-y-1">
            <h2 id="archived-credentials" className="text-lg font-semibold text-[var(--ink)]">
              Archived credentials ({archived.length})
            </h2>
            <p className="text-[13px] text-[var(--sage)]">
              Hidden from you and from agencies. Reactivate one to use it again, or delete it for good.
            </p>
          </div>
          <ul className="space-y-4">
            {archived.map((c) => (
              <ArchivedCredentialCard
                key={c.id}
                credential={c}
                onReactivated={replace}
                onDeleted={() => onChange((list) => list.filter((x) => x.id !== c.id))}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
