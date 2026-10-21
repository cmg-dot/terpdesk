"use client";

import { ErrorScreen } from "@/components/ErrorScreen";

/** Catches render errors in any agency page; the sidebar and header (the layout) stay on screen. */
export default function AgencyError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen error={error} reset={reset} area="agency" />;
}
