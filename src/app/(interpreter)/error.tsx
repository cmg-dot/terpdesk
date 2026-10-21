"use client";

import { ErrorScreen } from "@/components/ErrorScreen";

/** Catches render errors in any interpreter page; the sidebar and header (the layout) stay on screen. */
export default function InterpreterError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen error={error} reset={reset} area="interpreter" />;
}
