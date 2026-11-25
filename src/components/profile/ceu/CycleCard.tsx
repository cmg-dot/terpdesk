"use client";

import { AnimatePresence } from "framer-motion";
import { Link2, Plus } from "lucide-react";
import { CardActions } from "@/components/profile/ceu/CardActions";
import { CycleForm } from "@/components/profile/ceu/CycleForm";
import { ProgressMeter } from "@/components/profile/ceu/ProgressMeter";
import { formatDay } from "@/components/profile/credentialFormat";
import { Reveal } from "@/components/myWork/Reveal";
import { amountText, cycleFormValues, cycleProgress, renewalCountdown } from "@/lib/ceu";
import type { CycleView, EntryView } from "@/lib/ceu";
import { UNIT_LABEL } from "@/lib/validation/ceu";
import type { MyCredential } from "@/lib/validation/credential";

interface CycleCardProps {
  cycle: CycleView;
  entries: EntryView[];
  credentials: MyCredential[];
  timeZone: string;
  editing?: boolean;
  onEdit: (cycle: CycleView) => void;
  onSaved: (cycle: CycleView) => void;
  onCancelEdit: () => void;
  onDelete: (cycle: CycleView) => Promise<string | null>;
  /** Opens the "Log a training" form with this cycle chosen. */
  onLog: (cycle: CycleView) => void;
}

const CHIP = "inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--banner-edge)] bg-[var(--canvas)] px-2.5 py-0.5 text-[12px] text-[var(--sage)]";
const LOG_BUTTON = "inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[var(--forest)] px-4 text-[13px] font-medium text-white transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)] sm:min-h-9";

/** One renewal cycle: its name, dates and countdown badge, a progress bar for each target that is set, and Log, Edit and a two-step Delete. */
export function CycleCard({ cycle, entries, credentials, timeZone, editing = false, onEdit, onSaved, onCancelEdit, onDelete, onLog }: CycleCardProps) {
  const progress = cycleProgress(cycle, entries);
  const countdown = renewalCountdown(cycle.cycleEnd, timeZone);
  const linked = cycle.credentialId ? credentials.find((c) => c.id === cycle.credentialId) : undefined;
  const tracked = progress.total.target !== null || progress.ethics.target !== null || progress.ppo.target !== null;

  return (
    <li
      data-ceu-cycle={cycle.id}
      data-editing={editing ? "true" : "false"}
      className="rounded-2xl border border-[var(--banner-edge)] bg-white p-4 sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-[16px] font-semibold text-[var(--ink)]" data-label="">{cycle.label}</h3>
            {countdown && <span data-countdown={countdown.tier} className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${countdown.className}`}>{countdown.label}</span>}
          </div>
          <p className="text-[13px] text-[var(--sage)]">
            {formatDay(cycle.cycleStart)} to {formatDay(cycle.cycleEnd)}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-full bg-[var(--tint)] px-2.5 py-0.5 text-[12px] font-semibold text-[var(--tint-ink)]">{UNIT_LABEL[cycle.unit]}</span>
            {cycle.credentialId && (
              <span className={CHIP} data-linked="">
                <Link2 className="h-3 w-3" aria-hidden="true" />
                {linked ? linked.name : "Linked credential"}
                {linked?.expirationDate && <span className="text-[var(--sage)]"> (credential expires {formatDay(linked.expirationDate)})</span>}
              </span>
            )}
          </div>
        </div>
        {!editing && (
          <CardActions question="Delete this cycle? Its entries stay in your log." onEdit={() => onEdit(cycle)} onDelete={() => onDelete(cycle)}>
            <button type="button" onClick={() => onLog(cycle)} className={LOG_BUTTON}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Log training
            </button>
          </CardActions>
        )}
      </div>

      <div className="mt-4 space-y-3" data-ceu-progress="">
        <ProgressMeter label="Total" meter={progress.total} unit={cycle.unit} />
        <ProgressMeter label="Ethics" meter={progress.ethics} unit={cycle.unit} secondary />
        <ProgressMeter label="PPO" meter={progress.ppo} unit={cycle.unit} secondary />
        <p className="text-[13px] text-[var(--sage)]" data-ceu-logged="">
          {tracked ? "Logged: " : "No targets set. Logged: "}
          {amountText(progress.total.earned, cycle.unit)} in {progress.count} {progress.count === 1 ? "entry" : "entries"}.
        </p>
      </div>

      <AnimatePresence initial={false}>
        {editing && (
          <Reveal key="edit">
            <div className="mt-4 border-t border-[var(--banner-edge)] pt-4">
              <CycleForm embedded idPrefix={`cy-edit-${cycle.id}`} editingId={cycle.id} entryCount={progress.count} initial={cycleFormValues(cycle)} credentials={credentials} onSaved={onSaved} onCancel={onCancelEdit} />
            </div>
          </Reveal>
        )}
      </AnimatePresence>
    </li>
  );
}
