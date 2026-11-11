"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { ACTIVITY_LIST_CLASS, ActivityEntry, ActivityLog } from "@/components/requests/ActivityLog";
import type { ActivityItem } from "@/lib/requestActivity";

/** How many of the newest entries stay visible. Anything more than this is folded away behind "Show N older activity entries". */
export const ACTIVITY_VISIBLE = 5;

interface Props {
  items: ActivityItem[];
  timeZone: string;
  showInterpreterNames?: boolean;
  emptyText?: string;
  visibleCount?: number;
}

/**
 * The activity timeline for a long-lived request: the latest few entries, and the rest behind a toggle that opens smoothly ("Show 7 older
 * activity entries" / "Show less"), so the page does not become a long scroll. With few entries it is exactly the plain timeline and
 * shows no toggle. The folded entries are not in the page until they are opened.
 */
export function CollapsibleActivityLog({ items, timeZone, showInterpreterNames = false, emptyText, visibleCount = ACTIVITY_VISIBLE }: Props) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const panelId = useId();

  if (items.length <= visibleCount) return <ActivityLog items={items} timeZone={timeZone} showInterpreterNames={showInterpreterNames} emptyText={emptyText} />;

  const older = items.slice(visibleCount);
  const label = open ? "Show less" : `Show ${older.length} older activity ${older.length === 1 ? "entry" : "entries"}`;
  return (
    <div>
      <ol className={ACTIVITY_LIST_CLASS} data-activity-list>
        {items.slice(0, visibleCount).map((item) => (
          <ActivityEntry key={item.id} item={item} timeZone={timeZone} showInterpreterNames={showInterpreterNames} />
        ))}
        <AnimatePresence initial={false}>
          {open && (
            // The folded entries open and close by height. The side padding keeps each entry's dot (which sits left of the entry) inside the
            // clipped box, and the first entry's gap is its own top padding so the gap grows with the height instead of jumping.
            <motion.li
              key="older"
              id={panelId}
              data-activity-older
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
              className="!mt-0 -ml-7 list-none overflow-hidden pl-7"
            >
              <ol className="space-y-4 pt-4">
                {older.map((item) => (
                  <ActivityEntry key={item.id} item={item} timeZone={timeZone} showInterpreterNames={showInterpreterNames} />
                ))}
              </ol>
            </motion.li>
          )}
        </AnimatePresence>
      </ol>
      <button
        type="button"
        data-activity-toggle
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((was) => !was)}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-[var(--forest)] transition-colors hover:border-[rgb(var(--forest-rgb)/0.4)] hover:bg-[var(--mint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)]"
      >
        {label}
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
    </div>
  );
}
