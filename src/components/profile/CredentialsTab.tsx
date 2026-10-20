"use client";

import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Award, Plus } from "lucide-react";
import { CredentialCard } from "@/components/profile/CredentialCard";
import { CredentialForm } from "@/components/profile/CredentialForm";
import { useGlobalState } from "@/context/GlobalContext";
import type { MyCredential } from "@/lib/validation/credential";

interface CredentialsTabProps {
  credentials: MyCredential[];
  /** A state setter, so rapid changes (e.g. optimistic sharing, then the server's answer) never use a stale list. */
  onChange: Dispatch<SetStateAction<MyCredential[]>>;
  /** Agencies the interpreter is connected to (from approved roster rows). */
  connectedAgencyIds: string[];
}

const byName = (a: MyCredential, b: MyCredential) => a.name.localeCompare(b.name);

/** "My Profile" Credentials tab: what the interpreter holds, and which agencies may see each one. */
export const CredentialsTab = ({ credentials, onChange, connectedAgencyIds }: CredentialsTabProps) => {
  const { agencies: knownAgencies } = useGlobalState();
  // null = list view; "new" = add form; otherwise the id being edited.
  const [formFor, setFormFor] = useState<"new" | string | null>(null);

  // Agencies are not stored in the database yet, so names come from the app's agency list.
  const agencies = useMemo(
    () => connectedAgencyIds.map((id) => ({ id, name: knownAgencies.find((a) => a.id === id)?.name ?? "Agency" })),
    [connectedAgencyIds, knownAgencies],
  );

  const replace = (updated: MyCredential) =>
    onChange((list) => list.map((c) => (c.id === updated.id ? updated : c)).sort(byName));

  if (formFor) {
    const editing = formFor === "new" ? undefined : credentials.find((c) => c.id === formFor);
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

  if (credentials.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
        <Award className="mx-auto mb-3 h-8 w-8 text-gray-300" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-[var(--ink)]">Nothing listed yet</h2>
        <p className="mx-auto mb-6 mt-1 max-w-md text-sm text-[var(--sage)]">
          Add your certifications, qualifications, training and insurance so agencies know what you hold.
        </p>
        {addButton}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">{addButton}</div>
      <ul className="space-y-4">
        {credentials.map((c) => (
          <CredentialCard
            key={c.id}
            credential={c}
            agencies={agencies}
            onEdit={() => setFormFor(c.id)}
            onArchived={() => onChange((list) => list.filter((x) => x.id !== c.id))}
            onSharesChange={(shares) => onChange((list) => list.map((x) => (x.id === c.id ? { ...x, shares } : x)))}
          />
        ))}
      </ul>
    </div>
  );
};
