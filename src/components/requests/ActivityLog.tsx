import type { ActivityItem } from "@/lib/requestActivity";

/** The timeline's look: a thin rule down the left with a dot on each entry. Shared with the collapsible version. */
export const ACTIVITY_LIST_CLASS = "relative space-y-4 border-l border-gray-200 pl-5";

/** "Nov 10, 2026, 11:02 AM PST", in the job's own time zone (never the viewer's). */
export function formatActivityTime(iso: string, timeZone: string): string {
  try {
    // Explicit fields: dateStyle/timeStyle cannot be combined with timeZoneName (it throws, which sent every time to the viewer's own zone).
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

/** One entry of the timeline. */
export function ActivityEntry({ item, timeZone, showInterpreterNames = false }: { item: ActivityItem; timeZone: string; showInterpreterNames?: boolean }) {
  const who = [showInterpreterNames ? item.interpreterName : null, item.actorLabel].filter(Boolean).join(" · ");
  return (
    <li className="relative" data-activity-entry>
      <span aria-hidden="true" className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[var(--forest,#0B3B32)]" />
      <p className="text-[14px] font-medium text-[var(--ink)]">
        {item.message}
        {showInterpreterNames && item.audience === "shared" && (
          <span className="ml-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 align-middle text-[11px] font-medium text-emerald-800">
            Shared
          </span>
        )}
      </p>
      {item.changes.length > 1 && (
        <ul className="mt-1 space-y-0.5 text-[13px] text-gray-700">
          {item.changes.map((c) => (
            <li key={c.field}>
              <span className="font-medium">{c.field}</span> changed from <span className="line-through decoration-gray-400">{c.from}</span> to{" "}
              <span className="font-medium">{c.to}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-0.5 text-xs text-[var(--sage)]">
        {formatActivityTime(item.createdAt, timeZone)}
        {who ? ` · ${who}` : ""}
      </p>
    </li>
  );
}

/**
 * The request activity timeline, newest first. Presentational only (no hooks), so both the agency request page
 * (client) and the interpreter's secure job page (server) render it. Times are shown in the job's own time zone.
 * `showInterpreterNames` is the staff view: it also names interpreters and tags entries interpreters can see.
 */
export function ActivityLog({
  items,
  timeZone,
  showInterpreterNames = false,
  emptyText = "No activity recorded yet.",
}: {
  items: ActivityItem[];
  timeZone: string;
  showInterpreterNames?: boolean;
  emptyText?: string;
}) {
  if (items.length === 0) return <p className="text-sm text-[var(--sage)]">{emptyText}</p>;

  return (
    <ol className={ACTIVITY_LIST_CLASS}>
      {items.map((item) => (
        <ActivityEntry key={item.id} item={item} timeZone={timeZone} showInterpreterNames={showInterpreterNames} />
      ))}
    </ol>
  );
}
