"use client";

import { AnimatePresence } from "framer-motion";
import { CardActions } from "@/components/profile/ceu/CardActions";
import { EntryForm } from "@/components/profile/ceu/EntryForm";
import { formatDay } from "@/components/profile/credentialFormat";
import { Reveal } from "@/components/myWork/Reveal";
import { amountText, entryFormValues } from "@/lib/ceu";
import type { CycleView, EntryView } from "@/lib/ceu";

interface EntryCardProps {
  entry: EntryView;
  cycles: CycleView[];
  /** True while this card shows its edit form (it opens inside the card, so the list is never left). */
  editing?: boolean;
  onEdit: (entry: EntryView) => void;
  onSaved: (entry: EntryView) => void;
  onCancelEdit: () => void;
  onDelete: (entry: EntryView) => Promise<string | null>;
}

const CHIP = "inline-flex max-w-full items-center rounded-full border border-[var(--banner-edge)] bg-[var(--canvas)] px-2.5 py-0.5 text-[12px] text-[var(--sage)]";
const FOCUS_CHIP = "inline-flex items-center rounded-full bg-[var(--pill)] px-2.5 py-0.5 text-[12px] font-semibold text-white";

/** One logged training in the style of a My work card: the title, the provider, the amount, and the chips (date, category, cycle, Ethics, PPO). */
export function EntryCard({ entry, cycles, editing = false, onEdit, onSaved, onCancelEdit, onDelete }: EntryCardProps) {
  const cycle = entry.cycleId ? cycles.find((c) => c.id === entry.cycleId) : undefined;
  return (
    <div
      data-ceu-entry={entry.id}
      data-editing={editing ? "true" : "false"}
      role="listitem"
      className="rounded-2xl border border-[var(--banner-edge)] bg-white p-4 transition-[box-shadow,transform] duration-200 hover:-translate-y-px hover:shadow-[0_10px_28px_-14px_rgb(var(--forest-rgb)_/_0.45)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-[16px] font-semibold text-[var(--ink)]" data-title="">{entry.title}</h3>
          {entry.provider && <p className="mt-0.5 break-words text-[13px] text-[var(--sage)]" data-provider="">{entry.provider}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-full bg-[var(--tint)] px-2.5 py-0.5 text-[12px] font-semibold text-[var(--tint-ink)]" data-amount="">{amountText(entry.amount, entry.unit)}</span>
            <span className={CHIP}>{formatDay(entry.earnedOn)}</span>
            <span className={CHIP}>{entry.category}</span>
            <span className={CHIP} data-cycle-chip="">{cycle ? cycle.label : "No cycle"}</span>
            {entry.isEthics && <span className={FOCUS_CHIP}>Ethics</span>}
            {entry.isPpo && <span className={FOCUS_CHIP}>PPO</span>}
          </div>
        </div>
        {!editing && <CardActions question="Delete this entry?" onEdit={() => onEdit(entry)} onDelete={() => onDelete(entry)} />}
      </div>
      <AnimatePresence initial={false}>
        {editing && (
          <Reveal key="edit">
            <div className="mt-4 border-t border-[var(--banner-edge)] pt-4">
              <EntryForm embedded idPrefix={`ce-edit-${entry.id}`} editingId={entry.id} initial={entryFormValues(entry)} cycles={cycles} onSaved={onSaved} onCancel={onCancelEdit} />
            </div>
          </Reveal>
        )}
      </AnimatePresence>
    </div>
  );
}
