/** The page heading: title, one line of help, and (once the list is loaded) an emerald pill with the unread count. */
export function InboxHeader({ unread = null }: { unread?: number | null }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">Inbox</h1>
          {unread !== null && (
            <span
              data-inbox-unread-pill
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${unread > 0 ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-500"}`}
            >
              {unread > 0 && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />}
              {unread > 0 ? `${unread} unread` : "All caught up"}
            </span>
          )}
        </div>
        <p className="max-w-2xl text-[15px] text-[var(--sage)]">Emails sent to your agency&apos;s intake address.</p>
      </div>
    </div>
  );
}
