"use client";

import { useEffect } from "react";

interface ErrorScreenProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** Where it happened, for the log line (e.g. "dashboard"). */
  area: string;
}

/**
 * Friendly fallback for an unexpected error inside a page. The sidebar and header stay; only the page area is
 * replaced. The error is logged to the browser console with its area, and its message is tucked under "Details"
 * so it can be copied to support (it describes the code failure, never contains page data).
 */
export function ErrorScreen({ error, reset, area }: ErrorScreenProps) {
  useEffect(() => {
    // HIPAA: the error object is not printed (a message can quote data). The digest links it to the server log.
    console.error(`[${area}] page error`, { name: error.name, digest: error.digest });
  }, [error, area]);

  return (
    <div role="alert" className="mx-auto mt-10 w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-8 text-center">
      <h2 className="text-lg font-semibold text-[var(--ink)]">Something went wrong on this page</h2>
      <p className="mt-2 text-sm text-[var(--sage)]">
        Your data is safe. Try again, and if it keeps happening, reload the page or sign out and back in.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-[#0B3B32] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#082a23]"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full border border-gray-200 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Reload page
        </button>
      </div>
      <details className="mt-6 text-left text-xs text-gray-500">
        <summary className="cursor-pointer text-center">Details for support</summary>
        <p className="mt-2 break-words font-mono">
          {area}: {error.message || "Unknown error"}
          {error.digest ? ` (ref ${error.digest})` : ""}
        </p>
      </details>
    </div>
  );
}
