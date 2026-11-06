"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface Props {
  /** A stable name for the card (used by tests and styling hooks). */
  cardId: string;
  title: string;
  /** A line under the title that stays visible when the card is folded. */
  subtitle?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * A card whose body folds away behind its title, in the same look as the agency request page's "Request form" and "Job details
 * on file" cards (title row, chevron, white card with a thin border). Open by default. Whether it is open is plain state of the
 * page and is not saved anywhere. The title is a heading with a real button inside it, so it works with a keyboard and a
 * screen reader (aria-expanded / aria-controls).
 */
export function CollapsibleCard({ cardId, title, subtitle, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <section data-collapsible-card={cardId} data-open={open ? "true" : "false"} className="rounded-2xl border border-gray-200 bg-white">
      <h2 className="text-[16px] font-semibold text-[var(--ink)]">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex w-full items-center justify-between gap-3 rounded-2xl px-6 py-4 text-left"
        >
          <span className="min-w-0">
            {title}
            {subtitle && <span className="mt-0.5 block text-xs font-normal text-[var(--sage)]">{subtitle}</span>}
          </span>
          <ChevronDown className={`h-5 w-5 flex-none text-[#0B3B32] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </h2>
      {open && (
        <div id={bodyId} className="space-y-4 border-t border-gray-100 px-6 pb-6 pt-4">
          {children}
        </div>
      )}
    </section>
  );
}
