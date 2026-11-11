/** The queue's empty state: nothing recorded, or nothing that matches the search and filters. */
export function HoursEmptyState({ filtersActive, onClearFilters }: { filtersActive: boolean; onClearFilters: () => void }) {
  return (
    <div className="bg-white p-12 rounded-2xl border border-gray-200 text-center flex flex-col items-center justify-center">
      <h3 className="text-lg font-medium text-[var(--ink)] mb-2">No service records found</h3>
      {filtersActive ? (
        <>
          <p className="text-sm text-[var(--sage)] mb-4">No records match your search and filters.</p>
          <button type="button" onClick={onClearFilters} className="text-sm font-medium text-[var(--forest)] hover:underline">
            Clear filters
          </button>
        </>
      ) : (
        <p className="text-sm text-[var(--sage)]">There are currently no records to review.</p>
      )}
    </div>
  );
}
