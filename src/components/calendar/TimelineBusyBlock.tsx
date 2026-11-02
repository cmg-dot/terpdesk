import type { BusyBlock } from "@/lib/resourceTimeline";

const STRIPES = {
  backgroundImage: "repeating-linear-gradient(135deg, rgba(0,0,0,0.07) 0, rgba(0,0,0,0.07) 6px, transparent 6px, transparent 12px)",
};

/**
 * Time an interpreter has marked busy and shares with the agency: a greyed, striped band across the row, behind the job
 * blocks. It says only "Busy": the interpreter's own label for it is never sent to the browser. Not clickable.
 */
export const TimelineBusyBlock = ({ block }: { block: BusyBlock }) => (
  <div
    role="img"
    aria-label="Busy"
    title="Busy"
    data-busy-block
    className={`absolute inset-y-1 flex items-center overflow-hidden bg-gray-200 px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500 ${
      block.clippedStart ? "rounded-l-none" : "rounded-l-md"
    } ${block.clippedEnd ? "rounded-r-none" : "rounded-r-md"}`}
    style={{ left: `${block.leftPct}%`, width: `${block.widthPct}%`, ...STRIPES }}
  >
    <span className="truncate">Busy</span>
  </div>
);
