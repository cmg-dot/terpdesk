"use client";

import { useRef, useState } from "react";
import { verifyClaim } from "@/app/actions/verifyClaim";

/**
 * The confirm button for the emailed link. Pressing it is what submits the claim (a POST / Server Action), never
 * opening the page. The form refuses a second submit while the first is in flight, so a double click cannot race
 * itself into a "not valid" page.
 */
export const ConfirmClaimForm = ({ token }: { token: string }) => {
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  return (
    <form
      action={verifyClaim}
      onSubmit={(e) => {
        if (submittedRef.current) {
          e.preventDefault();
          return;
        }
        submittedRef.current = true;
        setSubmitting(true);
      }}
    >
      <input type="hidden" name="token" value={token} />
      <button
        type="submit"
        aria-disabled={submitting}
        className="rounded-full bg-[var(--forest)] px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 aria-disabled:opacity-60"
      >
        {submitting ? "Connecting…" : "Confirm and connect my profile"}
      </button>
    </form>
  );
};
