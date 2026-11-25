"use client";

import { forwardRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AnimatedListItem } from "@/components/features/hours-review/AnimatedListItem";
import { EntryCard } from "@/components/profile/ceu/EntryCard";
import { useHoursMotion } from "@/hooks/useHoursMotion";
import type { CycleView, EntryView } from "@/lib/ceu";

interface Props {
  /** The entries on the page being shown. */
  entries: EntryView[];
  cycles: CycleView[];
  page: number;
  editingId: string | null;
  onEdit: (entry: EntryView) => void;
  onSaved: (entry: EntryView) => void;
  onCancelEdit: () => void;
  onDelete: (entry: EntryView) => Promise<string | null>;
}

/** One page of cards, animated like the My work list: a new page fades in whole, a card a filter drops (or a delete removes) folds away. */
export const EntryList = forwardRef<HTMLDivElement, Props>(function EntryList({ entries, cycles, page, editingId, onEdit, onSaved, onCancelEdit, onDelete }, ref) {
  const { reduce, transition } = useHoursMotion();
  return (
    <div ref={ref} className="scroll-mt-4">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={page}
          role="list"
          aria-label="CEU log"
          className="-mb-3 flex flex-col"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, transition: transition(0.18) }}
          exit={{ opacity: 0, y: reduce ? 0 : -8, transition: transition(0.12) }}
        >
          <AnimatePresence initial={false}>
            {entries.map((entry, index) => (
              <AnimatedListItem key={entry.id} index={index}>
                <EntryCard entry={entry} cycles={cycles} editing={editingId === entry.id} onEdit={onEdit} onSaved={onSaved} onCancelEdit={onCancelEdit} onDelete={onDelete} />
              </AnimatedListItem>
            ))}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </div>
  );
});
