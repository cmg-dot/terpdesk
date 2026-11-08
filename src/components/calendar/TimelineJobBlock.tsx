import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { jobTone } from "@/lib/resourceTimeline";
import type { JobBlock } from "@/lib/resourceTimeline";
import type { TimelineJob } from "@/lib/interpreterDayView";

export const LANE_HEIGHT = 46;

const TONE_CLASS: Record<ReturnType<typeof jobTone>, string> = {
  live: "bg-emerald-600 text-white ring-1 ring-emerald-400 hover:bg-emerald-700",
  past: "bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200",
  attention: "bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100",
  booked: "bg-[var(--mint-pale)] text-[var(--mint-pale-ink)] border border-[#CDE0D8] hover:bg-[#D5E6DF]",
};

interface Props {
  block: JobBlock<TimelineJob>;
  zone: string;
  nowMs: number;
}

/** One job as a block inside an interpreter's row. It links to the job and is positioned by its time on the day's axis. */
export const TimelineJobBlock = ({ block, zone, nowMs }: Props) => {
  const { job } = block;
  const tone = jobTone(job.status, job.startsAt, job.endsAt, nowMs);
  const range = `${formatInTimeZone(job.startsAt, zone, "h:mm a")} – ${formatInTimeZone(job.endsAt, zone, "h:mm a")}`;
  const detail = job.location ?? job.title;
  const label = `${range}, ${detail}, ${job.status}${job.team ? `, position ${job.position}` : ""}`;

  return (
    <Link
      href={`/requests/${job.requestId}`}
      title={label}
      aria-label={label}
      data-job-block={job.requestId}
      className={`absolute flex flex-col justify-center overflow-hidden px-2 text-[11px] leading-tight transition-colors ${TONE_CLASS[tone]} ${
        block.clippedStart ? "rounded-l-none" : "rounded-l-md"
      } ${block.clippedEnd ? "rounded-r-none" : "rounded-r-md"}`}
      style={{
        left: `${block.leftPct}%`,
        width: `${block.widthPct}%`,
        minWidth: 64,
        top: block.lane * LANE_HEIGHT + 4,
        height: LANE_HEIGHT - 8,
      }}
    >
      <span className="truncate font-semibold">
        {block.clippedStart && "◂ "}
        {range}
        {block.clippedEnd && " ▸"}
      </span>
      <span className="truncate opacity-90">
        {job.team && <span className="mr-1 rounded bg-black/10 px-1 font-semibold">P{job.position}</span>}
        {detail}
      </span>
    </Link>
  );
};
