import type { BusyBlock } from "@/lib/resourceTimeline";

const STRIPES = {
  backgroundImage: "repeating-linear-gradient(135deg, rgba(0,0,0,0.07) 0, rgba(0,0,0,0.07) 6px, transparent 6px, transparent 12px)",
};

/**
 * Time an interpreter is not free and shares with the agency (private busy time and personal jobs, merged into one band): a greyed,
 * striped band across the row, behind the job blocks. It says only "Unavailable": no label, setting or kind of entry is ever sent
 * to the browser. Not clickable.
 */
export const TimelineBusyBlock = ({ block }: { block: BusyBlock }) => (
  <div
    role="img"
    aria-label="Unavailable"
    title="Unavailable"
    data-busy-block
    className={`absolute inset-y-1 flex items-center overflow-hidden bg-gray-200 px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500 ${
      block.clippedStart ? "rounded-l-none" : "rounded-l-md"
    } ${block.clippedEnd ? "rounded-r-none" : "rounded-r-md"}`}
    style={{ left: `${block.leftPct}%`, width: `${block.widthPct}%`, ...STRIPES }}
  >
    <span className="truncate">Unavailable</span>
  </div>
);
