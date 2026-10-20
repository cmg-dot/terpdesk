"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Mail } from "lucide-react";
import { resendVerification } from "@/app/actions/resendVerification";

const IS_DEV = process.env.NODE_ENV !== "production";

/**
 * Interpreter home notices for claiming an agency-created profile:
 * - a confirmation after the emailed link was used (?verified=true), and
 * - a slim, non-blocking reminder (with a resend link) while the login is not yet linked to that profile.
 * The emailed link stays the only way to claim a profile: sign-up never proves the person owns the address.
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

  const awaitingLink = session?.user?.role === "interpreter" && !session.user.interpreterId;

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

  if (justVerified && !awaitingLink) {
    return (
      <div role="status" className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-medium text-emerald-900">
        Email confirmed. Your account is now connected to your agency profile.
      </div>
    );
  }

  if (!awaitingLink) return null;

  return (
    <div role="status" className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[13px] text-gray-600">
      <Mail className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
      <span>An agency already has a profile for your email. Open the link we emailed you to connect it.</span>
      <button
        type="button"
        onClick={onResend}
        disabled={isPending || sent}
        className="font-medium text-[#0B3B32] hover:underline disabled:cursor-default disabled:no-underline disabled:opacity-70"
      >
        {isPending ? "Sending…" : sent ? (IS_DEV ? "Link printed in the server terminal" : "Sent. Check your email") : "Resend link"}
      </button>
      {error && <span className="text-red-700">{error}</span>}
    </div>
  );
};
