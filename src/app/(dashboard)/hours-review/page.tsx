"use client";

import { Suspense, useMemo } from "react";
import { LogStateJobHoursDialog } from "@/components/features/LogStateJobHoursDialog";
import { PendingVerifications } from "@/components/features/PendingVerifications";
import { HoursPager } from "@/components/features/hours-review/HoursPager";
import { HoursReviewFilterBar } from "@/components/features/hours-review/HoursReviewFilterBar";
import { AnimatedRecordList } from "@/components/features/hours-review/AnimatedRecordList";
import { HoursEmptyState } from "@/components/features/hours-review/HoursEmptyState";
import { useHoursRecords } from "@/hooks/useHoursRecords";
import { useHoursReviewFilters } from "@/hooks/useHoursReviewFilters";
import { DEFAULT_FILTERS, countActiveFilters, filterRecords, hrefForPage, statusCounts as countStatuses } from "@/lib/hoursReviewFilter";

const ITEMS_PER_PAGE = 10;

// Reuses the records hook's "storage" listener: firing the event reloads the records (and the pending reports) everywhere on the page.
const reloadRecords = () => window.dispatchEvent(new Event('storage'));

function HoursReviewContent() {
  const { filters, requestedPage, pathname, setFilters } = useHoursReviewFilters();
  const { records, updateRecord } = useHoursRecords();

  // The search and filters live in the URL (?q=&status=&range=&sig=&page=), so a view survives a reload and can be shared.
  const displayedRecords = useMemo(() => filterRecords(records, filters), [records, filters]);
  const statusCounts = useMemo(() => countStatuses(records), [records]);

  const totalPages = Math.max(1, Math.ceil(displayedRecords.length / ITEMS_PER_PAGE));
  const page = Math.min(requestedPage, totalPages);
  const pageRecords = displayedRecords.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  const hrefFor = (target: number) => hrefForPage(filters, target, pathname);

  return (
    <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 space-y-6 pb-24 antialiased pt-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[var(--ink)] mb-2">Hours review</h1>
          <p className="text-sm text-[var(--sage)] mb-6">
            Reported service time awaiting your confirmation. Approval records the service; it does not create pay or an invoice.
          </p>
        </div>
        <LogStateJobHoursDialog onLogged={reloadRecords} />
      </div>

      <HoursReviewFilterBar
        filters={filters}
        onChange={setFilters}
        statusCounts={statusCounts}
        shown={displayedRecords.length}
        total={records.length}
      />

      {/* Reports that could not be tied to one booked interpreter; assigning one reloads the records below. The search box filters them too. */}
      <PendingVerifications onAssigned={reloadRecords} query={filters.q} />

      {totalPages > 1 && <HoursPager position="top" page={page} totalPages={totalPages} hrefFor={hrefFor} />}

      <AnimatedRecordList
        records={pageRecords}
        viewKey={`${filters.status}:${page}`}
        onUpdate={updateRecord}
        empty={<HoursEmptyState filtersActive={countActiveFilters(filters) > 0} onClearFilters={() => setFilters(DEFAULT_FILTERS)} />}
      />

      {totalPages > 1 && <HoursPager page={page} totalPages={totalPages} hrefFor={hrefFor} />}
    </div>
  );
}

// useSearchParams requires a Suspense boundary in the App Router.
export default function HoursReviewPage() {
  return (
    <Suspense fallback={null}>
      <HoursReviewContent />
    </Suspense>
  );
}
