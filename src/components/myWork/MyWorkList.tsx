"use client";

import { forwardRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AnimatedListItem } from "@/components/features/hours-review/AnimatedListItem";
import { PersonalJobRow } from "@/components/myWork/PersonalJobRow";
import { useHoursMotion } from "@/hooks/useHoursMotion";
import { isUpcoming } from "@/lib/personalJobFilters";
import type { PersonalJobView } from "@/lib/personalJobs";

interface Props {
  /** The jobs on the page being shown. */
  jobs: PersonalJobView[];
  page: number;
  nowMs: number;
  editingId: string | null;
  onEdit: (job: PersonalJobView) => void;
  onSaved: (job: PersonalJobView) => void;
  onCancelEdit: () => void;
  onDelete: (job: PersonalJobView) => Promise<string | null>;
}

/**
 * One page of cards. A new page fades in as a whole (the old one fades out first); inside a page, a card a filter no longer matches
 * (or one that was deleted) folds away and the cards below it glide up. Reduced motion on the device makes every change land at once.
 */
export const MyWorkList = forwardRef<HTMLDivElement, Props>(function MyWorkList({ jobs, page, nowMs, editingId, onEdit, onSaved, onCancelEdit, onDelete }, ref) {
  const { reduce, transition } = useHoursMotion();
  return (
    <div ref={ref} className="scroll-mt-4">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={page}
          role="list"
          aria-label="Personal jobs"
          className="-mb-3 flex flex-col"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, transition: transition(0.18) }}
          exit={{ opacity: 0, y: reduce ? 0 : -8, transition: transition(0.12) }}
        >
          <AnimatePresence initial={false}>
            {jobs.map((job, index) => (
              <AnimatedListItem key={job.id} index={index}>
                <PersonalJobRow job={job} upcoming={isUpcoming(job, nowMs)} editing={editingId === job.id} onEdit={onEdit} onSaved={onSaved} onCancelEdit={onCancelEdit} onDelete={onDelete} />
              </AnimatedListItem>
            ))}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </div>
  );
});
