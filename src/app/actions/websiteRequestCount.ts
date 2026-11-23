"use server";

import { hasRole } from "@/lib/auth/guards";
import { countWebsiteRequestsNeedingReview } from "@/lib/websiteRequests";

/** How many website requests still need review (for the sidebar badge). 0 for anyone who is not an agency user, and when it cannot be counted. */
export async function getWebsiteReviewCount(): Promise<number> {
  if (!(await hasRole("agency"))) return 0;
  return countWebsiteRequestsNeedingReview();
}
