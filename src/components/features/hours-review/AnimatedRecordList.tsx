"use client";

import { useLayoutEffect, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { AnimatedListItem } from "@/components/features/hours-review/AnimatedListItem";
import { ServiceRecordCard } from "@/components/features/hours-review/ServiceRecordCard";
import { useHoursMotion } from "@/hooks/useHoursMotion";
import { HOURS_MOTION_FAST_S, HOURS_SLIDE_PX } from "@/lib/hoursMotion";
import type { ServiceRecord } from "@/utils/hoursReviewRecords";

interface Props {
  /** The records of the page being shown. */
  records: readonly ServiceRecord[];
  /** Changes when the view changes (another status tab, another page): the old list leaves, then the new one arrives. */
  viewKey: string;
  /** Which way the page number moved: the lists slide that way (1 = forward, -1 = back, 0 = a tab or filter change: a plain fade). */
  direction: -1 | 0 | 1;
  onUpdate: (record: ServiceRecord) => void;
  /** Shown instead of the cards when there are none. */
  empty: ReactNode;
}

/**
 * The hours review queue.
 *  - Changing page slides the old rows out and the new rows in the direction of travel; changing tab crossfades. 150 ms out, 200 ms in.
 *  - The space the old page took is held until the new page has arrived, so the pager below never jumps up and down mid-change.
 *  - If the list's top edge is above the window (the bottom pager was used), the list is brought back to the top of the window: the
 *    person stays at the rows, not thrown to the top of the page.
 *  - A record that stops matching (approved, sent back for correction) leaves by folding away, so the cards below glide up.
 * What each card shows, how a record is approved and which tab a record belongs to are decided elsewhere and untouched. Presentation only.
 */
export function AnimatedRecordList({ records, viewKey, direction, onUpdate, empty }: Props) {
  const { reduce, transition } = useHoursMotion();
  const holder = useRef<HTMLDivElement>(null);
  const [hold, setHold] = useState(0);
  const heldFor = useRef(viewKey);
  const anchoredFor = useRef(viewKey);

  // The view just changed: the old list is still on screen (it is leaving), so its height is the one to hold until the new list is in.
  useLayoutEffect(() => {
    if (heldFor.current === viewKey) return;
    heldFor.current = viewKey;
    setHold(holder.current?.offsetHeight ?? 0);
  }, [viewKey]);

  // Keep the person at the list: if its top edge is above the window, bring it back to the top edge (the sticky header is allowed for).
  useEffect(() => {
    if (anchoredFor.current === viewKey) return;
    anchoredFor.current = viewKey;
    const list = holder.current;
    if (list && list.getBoundingClientRect().top < 0) list.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, [viewKey, reduce]);

  const variants: Variants = {
    enter: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * HOURS_SLIDE_PX }),
    center: { opacity: 1, x: 0, transition: transition() },
    exit: (d: number) => ({ opacity: 0, x: reduce ? 0 : -d * HOURS_SLIDE_PX, transition: transition(HOURS_MOTION_FAST_S) }),
  };

  return (
    <div
      ref={holder}
      style={{ minHeight: hold }}
      className="scroll-mt-24 overflow-x-clip transition-[min-height] duration-200 ease-out motion-reduce:transition-none"
    >
      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div
          key={viewKey}
          custom={direction}
          variants={variants}
          initial={reduce ? false : "enter"}
          animate="center"
          exit="exit"
          onAnimationComplete={(definition) => {
            if (definition === "center") setHold(0);
          }}
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
    </div>
  );
}
