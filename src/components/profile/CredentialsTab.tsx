"use client";

import { useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Award, Building2, Plus } from "lucide-react";
import { ArchivedCredentialCard } from "@/components/profile/ArchivedCredentialCard";
import { CredentialCard } from "@/components/profile/CredentialCard";
import { CredentialForm } from "@/components/profile/CredentialForm";
import type { MyCredential } from "@/lib/validation/credential";

interface CredentialsTabProps {
  /** Active and archived credentials together; the tab splits them. */
  credentials: MyCredential[];
  /** A state setter, so rapid changes (e.g. an upload, then the server's answer) never use a stale list. */
  onChange: Dispatch<SetStateAction<MyCredential[]>>;
  /** The interpreter's profile time zone, for expiry badges. */
  timeZone: string;
  /** Shown above the credentials (the dedicated insurance sections). */
  children?: ReactNode;
}

const byName = (a: MyCredential, b: MyCredential) => a.name.localeCompare(b.name);

/** "My Profile" Credentials tab: who can see them, any sections passed in, active credentials, and an Archived section when there are any. */
export const CredentialsTab = ({ credentials, onChange, timeZone, children }: CredentialsTabProps) => {
  // null = list view; "new" = add form; otherwise the id being edited.
  const [formFor, setFormFor] = useState<"new" | string | null>(null);

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
      className="inline-flex items-center gap-2 rounded-full bg-[var(--forest)] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[var(--forest-hover)]"
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      Add a credential
    </button>
  );

  return (
    <div className="space-y-8">
      <p className="flex items-start gap-2.5 rounded-2xl border border-[#BCE1D1] bg-[var(--mint-pale)] px-4 py-3 text-[13px] leading-relaxed text-[var(--mint-pale-ink)]" data-credentials-visibility="">
        <Building2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-semibold">Visible to your agency.</span> Your active credentials and insurance, with their supporting files, can be seen by
          the staff of the agencies you work with (never by other interpreters or the public). Archive a credential to hide it.
        </span>
      </p>

      {children}

      {active.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
          <Award className="mx-auto mb-3 h-8 w-8 text-gray-300" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-[var(--ink)]">No other credentials yet</h2>
          <p className="mx-auto mb-6 mt-1 max-w-md text-sm text-[var(--sage)]">
            Add your certifications, qualifications and training so your agency knows what you hold.
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
                timeZone={timeZone}
                onEdit={() => setFormFor(c.id)}
                onArchived={() => replace({ ...c, isArchived: true })}
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
              Hidden from agencies. Reactivate one to use it again, or delete it for good.
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
