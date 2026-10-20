"use client";

import { getFileDownloadUrl } from "@/app/actions/fileAccess";

/**
 * Opens a stored file in a new tab via a fresh 5-minute signed link. The tab is opened during the click (before
 * awaiting the server) so popup blockers allow it, then pointed at the file. Returns an error message, or null.
 */
export async function openStoredFile(fileId: string): Promise<string | null> {
  const tab = window.open("about:blank", "_blank");
  if (tab) tab.opener = null;
  try {
    const result = await getFileDownloadUrl(fileId);
    if (!result.success) {
      tab?.close();
      return result.error;
    }
    if (tab) tab.location.href = result.url;
    else window.location.href = result.url;
    return null;
  } catch {
    tab?.close();
    return "We could not open this file. Please try again.";
  }
}
