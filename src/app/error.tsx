"use client";

import { ErrorScreen } from "@/components/ErrorScreen";

/**
 * Catches an error in a section layout (the agency or interpreter shell: sidebar, header, bell, the jobs provider) or one that
 * gets past a section's own error.tsx. Without it such errors went to global-error, which replaces the whole document.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-screen bg-[var(--canvas)] px-4 py-10">
      <ErrorScreen error={error} reset={reset} area="app" />
    </main>
  );
}
