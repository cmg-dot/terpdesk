import { Lock } from "lucide-react";
import type { FormRow, FormSection, StateFormView } from "@/lib/stateFormTypes";

/**
 * The state's request form as the page's main content: its five numbered sections in the state's own order and wording. Read
 * only. When the job has the state's email saved, this is that form; otherwise it is built from what the job has on file, and
 * anything missing says "Not on file" so staff can see at a glance what is still unknown. Section 5 (the person's details)
 * is marked as staff-only.
 */

const MISSING = { email: "Not provided", records: "Not on file" } as const;

function Row({ row, missing }: { row: FormRow; missing: string }) {
  if (!row.label) return <p className="py-2.5 text-sm leading-relaxed text-[var(--ink)]">{row.value}</p>;
  return (
    <div className="grid grid-cols-1 gap-0.5 border-b border-gray-100 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:gap-6">
      <dt className="text-sm text-[var(--sage)]">{row.label}</dt>
      <dd className={`min-w-0 whitespace-pre-line break-words text-sm leading-relaxed ${row.value ? "font-medium text-[var(--ink)]" : "italic text-gray-400"}`}>{row.value ?? missing}</dd>
    </div>
  );
}

function Section({ section, missing }: { section: FormSection; missing: string }) {
  const headingId = `form-section-${section.number}`;
  return (
    <section aria-labelledby={headingId} data-form-section={section.number} className="px-6 py-5 sm:px-8">
      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 id={headingId} className="text-[13px] font-semibold uppercase tracking-wide text-[var(--forest)]">
          {section.number}. {section.title}
        </h3>
        {section.tag && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900">{section.tag}</span>}
        {section.private && (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-600">
            <Lock className="h-3 w-3" aria-hidden="true" />
            Staff only
          </span>
        )}
      </div>
      <dl>
        {section.rows.map((row, i) => (
          <Row key={`${row.label}-${i}`} row={row} missing={missing} />
        ))}
      </dl>
    </section>
  );
}

/** `embedded`: drawn inside the collapsible card, which supplies the border and the "Request form" title. */
export function StateFormDocument({ view, embedded = false }: { view: StateFormView; embedded?: boolean }) {
  const missing = MISSING[view.source === "email" ? "email" : "records"];
  return (
    <article aria-label="The state's request form" data-state-form={view.source} className={embedded ? "" : "rounded-2xl border border-gray-200 bg-white"}>
      <header className="border-b border-gray-100 px-6 py-4 sm:px-8">
        {!embedded && <h2 className="text-[18px] font-medium text-[var(--ink)]">Request form</h2>}
        <p className={`text-xs text-[var(--sage)] ${embedded ? "" : "mt-0.5"}`}>
          {view.source === "email"
            ? `The state's request, as it was sent${view.sentAt ? ` (${view.sentAt})` : ""}.`
            : "The state's original form is not on file for this job. This is the same form built from the details we have; forward the original email to fill it in."}
        </p>
      </header>
      {view.banners.map((banner) => (
        <p key={banner} role="note" className="border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm font-medium text-amber-900 sm:px-8">
          {banner}
        </p>
      ))}
      <div className="divide-y divide-gray-100">
        {view.sections.map((section) => (
          <Section key={section.number} section={section} missing={missing} />
        ))}
      </div>
    </article>
  );
}
