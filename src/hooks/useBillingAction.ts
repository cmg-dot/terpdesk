"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BillingActionResult } from "@/lib/billing/actionGuard";

const FAILED = "Something went wrong. Nothing was changed. Please try again.";

/**
 * Runs one billing server action: tracks it as pending, keeps its error (and per-field errors) or a short "saved" note, and refreshes
 * the page's server data once it succeeds so every total reflects the change.
 */
export function useBillingAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const run = async (action: () => Promise<BillingActionResult>): Promise<boolean> => {
    if (pending) return false;
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const result = await action();
      if (!result.success) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return false;
      }
      setFieldErrors({});
      setSaved(true);
      router.refresh();
      return true;
    } catch {
      setError(FAILED);
      return false;
    } finally {
      setPending(false);
    }
  };

  return { run, pending, error, fieldErrors, saved, setFieldErrors };
}
