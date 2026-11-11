"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AnimatedListItem } from "@/components/features/hours-review/AnimatedListItem";
import { ServiceRecordCard } from "@/components/features/hours-review/ServiceRecordCard";
import { useHoursMotion } from "@/hooks/useHoursMotion";
import { HOURS_MOTION_FAST_S } from "@/lib/hoursMotion";
import type { ServiceRecord } from "@/utils/hoursReviewRecords";

interface Props {
  /** The records of the page being shown. */
  records: readonly ServiceRecord[];
  /** Changes when the view changes (another status tab, another page): the old list fades out, then the new one fades in. */
  viewKey: string;
  onUpdate: (record: ServiceRecord) => void;
  /** Shown instead of the cards when there are none. */
  empty: ReactNode;
}

/**
 * The hours review queue. Switching status tab or page crossfades the whole list with a light stagger; a record that stops matching
 * (approved, sent back for correction) leaves by folding away, so the cards below glide up. The cards of a new view animate in one after
 * another (a light stagger), under the list's own short fade. What each card shows, how a record is
 * approved and which tab a record belongs to are decided elsewhere and untouched. Presentation only.
 */
export function AnimatedRecordList({ records, viewKey, onUpdate, empty }: Props) {
  const { reduce, transition } = useHoursMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={viewKey}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1, transition: transition() }}
        exit={{ opacity: 0, transition: transition(HOURS_MOTION_FAST_S) }}
        className={records.length > 0 ? "flex w-full flex-col -mb-3" : "w-full"}
        data-record-list={viewKey}
      >
        {records.length === 0 ? (
          empty
        ) : (
          <AnimatePresence>
            {records.map((record, index) => (
              <AnimatedListItem key={record.id} index={index}>
                <ServiceRecordCard record={record} onUpdate={onUpdate} />
              </AnimatedListItem>
            ))}
          </AnimatePresence>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
