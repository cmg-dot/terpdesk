"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { resendVerification } from "@/app/actions/resendVerification";

const IS_DEV = process.env.NODE_ENV !== "production";

/**
 * Top-of-dashboard notices for interpreters:
 * - a success banner after the emailed link was used (?verified=true), and
 * - a persistent warning while the login is not yet linked to an interpreter profile, with a resend button.
 */
export const VerificationBanners = () => {
  const { data: session, update } = useSession();
  const [justVerified, setJustVerified] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("verified") !== "true") return;
    setJustVerified(true);
    // The link was just used, so refresh the session; it now carries the linked profile.
    void update();
  }, [update]);

  const isUnverified = session?.user?.role === "interpreter" && !session.user.interpreterId;

  const onResend = async () => {
    if (isPending) return;
    setIsPending(true);
    setError(null);
    try {
      const result = await resendVerification();
      if (result.success) setSent(true);
      else setError(result.error);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <>
      {justVerified && !isUnverified && (
        <div role="status" className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-900">
          Profile verified! Your account is now fully connected to your agency roster.
        </div>
      )}

      {isUnverified && (
        <div role="alert" className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Your account is limited.</p>
            <p>Please verify your email to access your agency schedule and offers.</p>
            {error && <p className="mt-1 text-red-700">{error}</p>}
          </div>
          <button
            type="button"
            onClick={onResend}
            disabled={isPending || sent}
            className="shrink-0 rounded-full border border-amber-400 bg-white px-5 py-2 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isPending ? "Sending…" : sent ? (IS_DEV ? "Link sent to terminal!" : "Link sent! Check your email") : "Resend verification link"}
          </button>
        </div>
      )}
    </>
  );
};
