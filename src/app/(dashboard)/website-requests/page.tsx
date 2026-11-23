import { redirect } from "next/navigation";
import { WebsiteRequestsBoard } from "@/components/requests/website/WebsiteRequestsBoard";
import { requireRole } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { parseFilters } from "@/lib/websiteRequestView";
import { loadWebsiteRequests } from "@/lib/websiteRequests";
import type { WebsiteRequestRow } from "@/lib/websiteRequests";

export const dynamic = "force-dynamic";

/**
 * Requests made from the public intake form (POST /api/intake/public, called by the agency website's server): each is a draft in
 * Requests that staff review before anything is offered. Agency staff only (the middleware matches this path, and it is checked here too).
 * The filters in the address (`?tab=handled&q=clinic`) are read here so a shared link shows the same view.
 */
export default async function WebsiteRequestsPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
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
    <div className="mx-auto max-w-[1200px] space-y-6 pb-24 pt-2 antialiased">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">Website requests</h1>
        <p className="max-w-2xl text-[15px] text-[var(--sage)]">
          Guest requests awaiting agency review. No interpreter is confirmed until staff create and staff the appointment.
        </p>
      </div>
      <WebsiteRequestsBoard rows={rows} loadFailed={loadFailed} initialFilters={parseFilters(searchParams ?? {})} serverNow={Date.now()} />
    </div>
  );
}
