import { redirect } from "next/navigation";
import { WebsiteRequestsList } from "@/components/requests/WebsiteRequestsList";
import { requireRole } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { loadWebsiteRequests } from "@/lib/websiteRequests";
import type { WebsiteRequestRow } from "@/lib/websiteRequests";

export const dynamic = "force-dynamic";

/**
 * Requests made from the public intake form (POST /api/intake/public, called by the agency website's server): each is a draft in
 * Requests that staff review before anything is offered. Agency staff only (the middleware matches this path, and it is checked here too).
 */
export default async function WebsiteRequestsPage() {
  try {
    await requireRole("agency");
  } catch {
    redirect("/login/agency");
  }

  let rows: WebsiteRequestRow[] = [];
  let loadFailed = false;
  try {
    rows = await loadWebsiteRequests();
  } catch (err) {
    logError("WebsiteRequestsPage", err);
    loadFailed = true;
  }

  return (
    <div className="max-w-[1200px] mx-auto p-6 space-y-6 pb-24 antialiased">
      <div className="space-y-2 mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">Website requests</h1>
        <p className="text-[15px] text-[var(--sage)] max-w-2xl mt-2 mb-8">
          Guest requests awaiting agency review. No interpreter is confirmed until staff create and staff the appointment.
        </p>
      </div>
      <WebsiteRequestsList rows={rows} loadFailed={loadFailed} />
    </div>
  );
}
