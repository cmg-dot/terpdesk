import { InboxHeader } from "@/components/features/inbox/InboxHeader";
import { InboxView } from "@/components/features/inbox/InboxView";
import { requireRole } from "@/lib/auth/guards";
import { listInboxEmails } from "@/lib/inbox";
import { logError } from "@/lib/logError";
import type { InboxListItem } from "@/types/inbox";

export const metadata = { title: "Inbox | terpDESK" };
export const dynamic = "force-dynamic";

export default async function InboxPage() {
  // The middleware already requires an agency session; this keeps the database read behind its own check too.
  await requireRole("agency");

  let emails: InboxListItem[] | null = null;
  try {
    emails = await listInboxEmails();
  } catch (err) {
    logError("InboxPage", err);
  }

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-4 p-4 pb-24 antialiased sm:p-6 lg:px-0">
      {emails ? (
        <InboxView emails={emails} />
      ) : (
        <>
          <InboxHeader />
          <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
            We couldn&apos;t load your inbox. Please refresh the page.
          </div>
        </>
      )}
    </div>
  );
}
