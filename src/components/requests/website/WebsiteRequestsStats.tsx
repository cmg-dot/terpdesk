import { CalendarClock, Clock, Inbox } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { waitingLabel } from "@/lib/websiteRequestView";
import type { BoardStats, SortKey, StatusTab } from "@/lib/websiteRequestView";

interface StatsPick {
  tab: StatusTab;
  sort: SortKey;
}

function Tile({ icon: Icon, label, value, hint, accent = false, onPick }: { icon: LucideIcon; label: string; value: string; hint: string; accent?: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="group relative flex min-w-0 items-center gap-3 rounded-2xl bg-[var(--tint)] p-4 text-left text-[var(--tint-ink)] transition-[box-shadow,transform] duration-200 hover:-translate-y-px hover:shadow-[0_10px_28px_-14px_rgb(var(--forest-rgb)_/_0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      aria-label={`${label}: ${value}. ${hint}`}
    >
      {accent && <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-[var(--badge)]" aria-hidden="true" />}
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/70">
        <Icon className="h-5 w-5 text-[var(--forest)]" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[26px] font-semibold leading-none text-[var(--forest)]">{value}</span>
        <span className="mt-1 block text-[12px] font-medium">{label}</span>
      </span>
    </button>
  );
}

/** Three numbers over the queue. Each one is also a shortcut: it shows the unreviewed requests, ordered the way the number is measured. */
export function WebsiteRequestsStats({ stats, onPick }: { stats: BoardStats; onPick: (pick: StatsPick) => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-website-stats="">
      <Tile icon={Inbox} label="Needs review" value={String(stats.needsReview)} hint="Show the requests waiting for review" onPick={() => onPick({ tab: "needs_review", sort: "soonest" })} />
      <Tile
        icon={CalendarClock}
        label="Starting within 48 hours"
        value={String(stats.startingSoon)}
        hint="Show the soonest appointments first"
        accent={stats.startingSoon > 0}
        onPick={() => onPick({ tab: "needs_review", sort: "soonest" })}
      />
      <Tile
        icon={Clock}
        label="Longest waiting"
        value={stats.longestWaitingMinutes === null ? "None" : waitingLabel(stats.longestWaitingMinutes).replace("Waiting ", "")}
        hint="Show the requests that have waited longest first"
        onPick={() => onPick({ tab: "needs_review", sort: "waiting" })}
      />
    </div>
  );
}
