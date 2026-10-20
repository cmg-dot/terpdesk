import { expiryStatus, formatDay, neutralBadge, badgeBase } from "@/components/profile/credentialFormat";
import type { SharedCredentialView } from "@/lib/agencyInterpreterView";

/** "Qualifications they report": active credentials the interpreter chose to share with this agency. */
export const SharedCredentialsSection = ({ credentials }: { credentials: SharedCredentialView[] }) => (
  <section className="rounded-2xl border border-gray-200 bg-white p-6">
    <h2 className="mb-1 text-lg font-semibold text-[var(--ink)]">Qualifications they report</h2>
    <p className="mb-4 text-[12px] text-gray-500">
      Self-reported by the interpreter. terpDESK has not checked these details, and they do not approve anyone for
      specialised work.
    </p>

    {credentials.length === 0 ? (
      <p className="rounded-xl bg-stone-50 px-4 py-3 text-[13px] text-gray-600">
        This interpreter has not shared any credentials with your agency. Interpreters choose which credentials each
        agency can see from their own profile.
      </p>
    ) : (
      <ul className="space-y-3">
        {credentials.map((c) => {
          const status = expiryStatus(c.expirationDate);
          const dates = [c.issueDate && `Issued ${formatDay(c.issueDate)}`, c.expirationDate && `Expires ${formatDay(c.expirationDate)}`]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={c.id} className="rounded-xl border border-stone-200 bg-stone-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[15px] font-semibold text-[var(--ink)]">{c.name}</h3>
                <span className={neutralBadge}>{c.type}</span>
                {status && <span className={`${badgeBase} ${status.className}`}>{status.label}</span>}
              </div>
              {c.issuedBy && <p className="mt-1 text-[13px] text-gray-600">Issued by {c.issuedBy}</p>}
              {dates && <p className="text-[13px] text-gray-500">{dates}</p>}
            </li>
          );
        })}
      </ul>
    )}
  </section>
);
