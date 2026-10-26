import Link from "next/link";
import { Logo } from "@/components/logo";

/** One bullet. `label` is the bold lead-in ("Account and profile information:"). */
export interface LegalListItem {
  label?: string;
  text: string;
}

export interface LegalContact {
  name: string;
  attention: string;
  address: string;
  email: string;
  phone: string;
  website: string;
}

export type LegalBlock =
  | { kind: "p"; text: string }
  | { kind: "list"; items: LegalListItem[] }
  | { kind: "contact"; contact: LegalContact };

export interface LegalSection {
  heading: string;
  blocks: LegalBlock[];
}

export interface LegalDocument {
  title: string;
  effectiveDate: string;
  sections: LegalSection[];
}

const sectionId = (index: number): string => `section-${index + 1}`;

function Block({ block }: { block: LegalBlock }) {
  if (block.kind === "p") {
    return <p className="mt-3 text-[15px] leading-7 text-slate-700">{block.text}</p>;
  }
  if (block.kind === "list") {
    return (
      <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-7 text-slate-700 marker:text-slate-400">
        {block.items.map((item) => (
          <li key={item.label ?? item.text} className="pl-1">
            {item.label ? <strong className="font-semibold text-[var(--ink)]">{item.label} </strong> : null}
            {item.text}
          </li>
        ))}
      </ul>
    );
  }
  const { contact } = block;
  return (
    <address className="mt-3 space-y-0.5 text-[15px] not-italic leading-7 text-slate-700">
      <p className="font-semibold text-[var(--ink)]">{contact.name}</p>
      <p>{contact.attention}</p>
      <p>{contact.address}</p>
      <p>
        Email:{" "}
        <a className="font-medium text-[var(--forest)] underline underline-offset-2" href={`mailto:${contact.email}`}>
          {contact.email}
        </a>
      </p>
      <p>
        Phone:{" "}
        <a className="font-medium text-[var(--forest)] underline underline-offset-2" href={`tel:${contact.phone.replace(/\D/g, "")}`}>
          {contact.phone}
        </a>
      </p>
      <p>
        Website:{" "}
        <a className="font-medium text-[var(--forest)] underline underline-offset-2" href={`https://${contact.website}`}>
          {contact.website}
        </a>
      </p>
    </address>
  );
}

/** Shared layout for the public Privacy Policy and Terms & Conditions pages: readable column, contents list, clear headings. */
export function LegalPage({ document, current }: { document: LegalDocument; current: "privacy" | "terms" }) {
  const linkClass = "underline underline-offset-2 hover:text-[var(--ink)]";
  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" aria-label="terpDESK home">
            <Logo />
          </Link>
          <nav aria-label="Legal" className="flex gap-4 text-sm text-[var(--sage)]">
            <Link href="/privacy" aria-current={current === "privacy" ? "page" : undefined} className={current === "privacy" ? "font-semibold text-[var(--ink)]" : linkClass}>
              Privacy
            </Link>
            <Link href="/terms" aria-current={current === "terms" ? "page" : undefined} className={current === "terms" ? "font-semibold text-[var(--ink)]" : linkClass}>
              Terms
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 pb-20 sm:px-6 sm:py-12">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">{document.title}</h1>
        <p className="mt-2 text-sm text-[var(--sage)]">Effective date: {document.effectiveDate}</p>

        <nav aria-label="Contents" className="mt-8 rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--sage)]">Contents</h2>
          <ol className="mt-3 grid gap-x-6 gap-y-1.5 text-sm text-slate-700 sm:grid-cols-2">
            {document.sections.map((section, i) => (
              <li key={section.heading}>
                <a href={`#${sectionId(i)}`} className="hover:text-[var(--forest)] hover:underline">
                  {i + 1}. {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-2">
          {document.sections.map((section, i) => (
            <section key={section.heading} id={sectionId(i)} aria-labelledby={`${sectionId(i)}-title`} className="scroll-mt-6 pt-8">
              <h2 id={`${sectionId(i)}-title`} className="text-xl font-semibold tracking-tight text-[var(--ink)]">
                {i + 1}. {section.heading}
              </h2>
              {section.blocks.map((block, j) => (
                <Block key={j} block={block} />
              ))}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
