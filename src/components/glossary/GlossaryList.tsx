"use client";

import { forwardRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AnimatedListItem } from "@/components/features/hours-review/AnimatedListItem";
import { GlossaryCard } from "@/components/glossary/GlossaryCard";
import { useHoursMotion } from "@/hooks/useHoursMotion";
import type { GlossaryTermView } from "@/lib/glossary";

interface Props {
  /** The terms on the page being shown. */
  terms: GlossaryTermView[];
  page: number;
  editingId: string | null;
  onEdit: (term: GlossaryTermView) => void;
  onSaved: (term: GlossaryTermView) => void;
  onCancelEdit: () => void;
  onDelete: (term: GlossaryTermView) => Promise<string | null>;
}

/** One page of cards, animated like the My work list: a new page fades in whole, a card a filter drops (or a delete removes) folds away. */
export const GlossaryList = forwardRef<HTMLDivElement, Props>(function GlossaryList({ terms, page, editingId, onEdit, onSaved, onCancelEdit, onDelete }, ref) {
  const { reduce, transition } = useHoursMotion();
  return (
    <div ref={ref} className="scroll-mt-4">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={page}
          role="list"
          aria-label="Glossary terms"
          className="-mb-3 flex flex-col"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, transition: transition(0.18) }}
          exit={{ opacity: 0, y: reduce ? 0 : -8, transition: transition(0.12) }}
        >
          <AnimatePresence initial={false}>
            {terms.map((term, index) => (
              <AnimatedListItem key={term.id} index={index}>
                <GlossaryCard term={term} editing={editingId === term.id} onEdit={onEdit} onSaved={onSaved} onCancelEdit={onCancelEdit} onDelete={onDelete} />
              </AnimatedListItem>
            ))}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </div>
  );
});
