"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { hrefForPage, parseFilters, parsePage } from "@/lib/hoursReviewFilter";
import type { HoursFilters } from "@/lib/hoursReviewFilter";

/**
 * Hours review's filters and page, read from and written to the URL. Changing any filter replaces the URL (no new history
 * entry, no full reload, no jump to the top) and goes back to page 1; paging is a link built with `hrefForPage`.
 */
export function useHoursReviewFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);
  const requestedPage = useMemo(() => parsePage(searchParams), [searchParams]);

  const setFilters = useCallback(
    (patch: Partial<HoursFilters>) => router.replace(hrefForPage({ ...filters, ...patch }, 1, pathname), { scroll: false }),
    [router, pathname, filters],
  );

  return { filters, requestedPage, pathname, setFilters };
}
