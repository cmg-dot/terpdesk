"use client";

import { useState } from "react";
import { Copy, Eye } from "lucide-react";
import { getInterpreterPreviewLink } from "@/app/actions/interpreterPreviewLink";

const BUTTON = "inline-flex items-center gap-1.5 text-sm font-medium text-[var(--sage)] transition-colors hover:text-[var(--ink)] disabled:opacity-60";

/**
 * "Copy interpreter link" and "Preview as interpreter" on a booked slot: the interpreter's secure job-details link, made on
 * demand with no email sent. Copying puts it on the clipboard (if the browser refuses, the link is shown to copy by hand);
 * Preview opens it in a new tab (the tab is opened on the click itself so pop-up blockers allow it).
 */
export function InterpreterLinkButtons({ requestId, positionIndex }: { requestId: string; positionIndex: 1 | 2 }) {
  const [busy, setBusy] = useState<"copy" | "preview" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [manualLink, setManualLink] = useState<string | null>(null);

  const run = async (kind: "copy" | "preview") => {
    if (busy) return;
    setBusy(kind);
    setMessage(null);
    setManualLink(null);
    const tab = kind === "preview" ? window.open("", "_blank") : null;
    try {
      const result = await getInterpreterPreviewLink({ requestId, positionIndex });
      if (!result.success) {
        tab?.close();
        setMessage({ ok: false, text: result.error });
        return;
      }
      if (kind === "preview") {
        if (tab) {
          tab.opener = null;
          tab.location.href = result.url;
        } else {
          setManualLink(result.url);
          setMessage({ ok: false, text: "Your browser blocked the new tab. Copy the link below." });
        }
        return;
      }
      try {
        await navigator.clipboard.writeText(result.url);
        setMessage({ ok: true, text: "Interpreter link copied." });
      } catch {
        setManualLink(result.url);
        setMessage({ ok: false, text: "Could not copy automatically. Copy the link below." });
      }
    } catch {
      tab?.close();
      setMessage({ ok: false, text: "Something went wrong. Please try again." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-1" data-interpreter-link-buttons>
      <span className="inline-flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => run("copy")} disabled={busy !== null} className={BUTTON}>
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          {busy === "copy" ? "Making link…" : "Copy interpreter link"}
        </button>
        <button type="button" onClick={() => run("preview")} disabled={busy !== null} className={BUTTON}>
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          {busy === "preview" ? "Opening…" : "Preview as interpreter"}
        </button>
      </span>
      {message && (
        <span role={message.ok ? "status" : "alert"} className={`text-xs ${message.ok ? "text-emerald-700" : "text-red-700"}`}>
          {message.text}
        </span>
      )}
      {manualLink && <input readOnly aria-label="Interpreter link" value={manualLink} onFocus={(e) => e.currentTarget.select()} className="w-72 max-w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700" />}
    </span>
  );
}
