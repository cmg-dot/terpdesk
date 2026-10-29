"use client";

import { useMemo } from "react";
import { sanitizeEmailHtml } from "@/lib/inboxSanitize";
import type { InboxEmail } from "@/types/inbox";

/** Typography for received HTML (the page's CSS reset removes list markers, heading sizes and so on). */
const HTML_STYLES =
  "break-words text-sm leading-relaxed text-[var(--ink)] [&_a]:text-[var(--forest)] [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-gray-200 [&_blockquote]:pl-3 " +
  "[&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_img]:h-auto [&_img]:max-w-full [&_ol]:list-decimal [&_ol]:pl-5 " +
  "[&_p]:my-2 [&_table]:max-w-full [&_ul]:list-disc [&_ul]:pl-5";

/**
 * The email's content. HTML is shown only after DOMPurify has sanitized it in the browser; when there is no HTML, or it
 * cannot be sanitized, or nothing is left of it, the plain-text version is shown instead (as text, never as markup).
 */
export function InboxEmailBody({ email }: { email: Pick<InboxEmail, "bodyHtml" | "bodyText"> }) {
  const safeHtml = useMemo(() => (email.bodyHtml?.trim() ? sanitizeEmailHtml(email.bodyHtml) : null), [email.bodyHtml]);

  if (safeHtml?.trim()) {
    return <div className={`overflow-x-auto ${HTML_STYLES}`} dangerouslySetInnerHTML={{ __html: safeHtml }} />;
  }
  return <p className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-[var(--ink)]">{email.bodyText}</p>;
}
