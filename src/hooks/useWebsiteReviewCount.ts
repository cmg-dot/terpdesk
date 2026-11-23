"use client";

import { usePathname } from "next/navigation";
import { getWebsiteReviewCount } from "@/app/actions/websiteRequestCount";
import { usePolledCount } from "@/hooks/usePolledCount";

/** The live number of website requests that still need review (the sidebar badge). Re-counted whenever the person moves to another page. */
export const useWebsiteReviewCount = (): number => {
  const pathname = usePathname();
  return usePolledCount(getWebsiteReviewCount, undefined, pathname ?? undefined);
};
