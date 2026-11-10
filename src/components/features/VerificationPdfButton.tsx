"use client";

import { useState } from "react";
import { verificationPdfUrl } from "@/lib/verificationPdf/url";

interface Props {
  requestId: string;
  /** The position's stable id (what the hours are stored under). */
  position: number;
  className?: string;
}

const BUTTON =
  "inline-flex items-center rounded-full border border-gray-300 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60";

const messageFor = (status: number): string => {
  if (status === 401) return "Please sign in again.";
  if (status === 404) return "There is no verification PDF for this record.";
  if (status === 502) return "The on-site signature could not be read. Please try again.";
  return "Could not create the PDF. Please try again.";
};

const fileNameOf = (header: string | null): string => /filename="([^"]+)"/.exec(header ?? "")?.[1] ?? "invoice.pdf";

/**
 * One click downloads the Independent Contractor Invoice for a position (non-state jobs with hours submitted). The PDF holds the
 * participant's name and the signatures, so it is fetched with the staff session, saved straight to disk and never opened in a
 * shared viewer or cached. Agency screens only.
 */
export function VerificationPdfButton({ requestId, position, className }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(verificationPdfUrl(requestId, position), { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) {
        setError(messageFor(res.status));
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = fileNameOf(res.headers.get("Content-Disposition"));
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError("Could not create the PDF. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <button type="button" onClick={download} disabled={busy} className={BUTTON} data-testid="verification-pdf-button">
        {busy ? "Preparing PDF…" : "Download Verification PDF"}
      </button>
      {error && (
        <p className="mt-1 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
