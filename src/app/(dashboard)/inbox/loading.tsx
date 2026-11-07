export default function InboxLoading() {
  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-4 p-4 pb-24 sm:p-6 lg:px-0" aria-busy="true" aria-label="Loading inbox">
      <div className="h-9 w-32 animate-pulse rounded-lg bg-gray-200" />
      <div className="h-4 w-64 animate-pulse rounded bg-gray-200" />
      <div className="grid gap-4 lg:grid-cols-[clamp(300px,26%,380px)_minmax(0,1fr)]">
        <div className="h-96 animate-pulse rounded-2xl bg-gray-200" />
        <div className="hidden h-96 animate-pulse rounded-2xl bg-gray-200 lg:block" />
      </div>
    </div>
  );
}
