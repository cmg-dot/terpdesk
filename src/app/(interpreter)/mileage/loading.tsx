export default function MileageLoading() {
  return (
    <div className="mx-auto w-full max-w-[1000px] space-y-6 p-4 pb-24 sm:p-6" aria-busy="true" aria-label="Loading mileage">
      <div className="h-9 w-40 animate-pulse rounded-lg bg-gray-200" />
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 w-28 animate-pulse rounded-full bg-gray-200" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="h-28 animate-pulse rounded-2xl bg-gray-200" />
        <div className="h-28 animate-pulse rounded-2xl bg-gray-200" />
      </div>
      <div className="h-32 animate-pulse rounded-2xl bg-gray-200" />
    </div>
  );
}
