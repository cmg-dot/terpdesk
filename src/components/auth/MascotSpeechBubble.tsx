"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useMascotHint } from "@/components/auth/LoginMascotContext";
import { loginPathForRole } from "@/lib/auth/routes";
import type { AppRole } from "@/lib/auth/routes";
import { WRONG_PORTAL_MESSAGES } from "@/lib/auth/messages";

/** The other portal's sign-in, keeping the page the person was headed for (the form there decides whether it may follow it). */
const otherPortalHref = (portal: AppRole): string => {
  const other: AppRole = portal === "agency" ? "interpreter" : "agency";
  const callback = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("callbackUrl");
  return callback ? `${loginPathForRole(other)}?callbackUrl=${encodeURIComponent(callback)}` : loginPathForRole(other);
};

/**
 * The owl's speech bubble for a refused sign-in: a wrong password, a wrong code, or the wrong portal (with a link to the right
 * one), and its "Welcome to terpDESK!" as a sign-in succeeds. A refusal's bubble goes away as soon as the person edits the form. The form's own error box still says the same in words for screen
 * readers, so the plain bubbles are hidden from them; the wrong-portal one stays reachable for its link.
 *   "panel"    to the right of the owl's head in the wide brand panel (clear of the headline even on short screens), the tail
 *              pointing left at the owl
 *   "compact"  beside the peeking owl on phones, the tail pointing left
 */
export const MascotSpeechBubble = ({ layout }: { layout: "panel" | "compact" }) => {
  const { mood, portal } = useMascotHint();
  const reduce = Boolean(useReducedMotion());
  const show = mood === "passwordError" || mood === "mfaError" || mood === "success" || (mood === "wrongPortal" && portal !== null);
  const other: AppRole = portal === "agency" ? "interpreter" : "agency";

  const place = layout === "panel" ? "absolute bottom-[60%] left-[80%] w-max max-w-64 origin-bottom-left" : "relative mb-5 min-w-0 max-w-[230px] flex-1 origin-left";
  const tail = layout === "panel" ? "-left-[7px] bottom-5 border-b border-l" : "-left-[7px] top-1/2 -translate-y-1/2 border-b border-l";

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key={mood}
          role={mood === "wrongPortal" ? "note" : undefined}
          aria-hidden={mood === "wrongPortal" ? undefined : true}
          data-mascot-bubble={mood}
          className={`${place} pointer-events-auto z-20 rounded-2xl border border-neutral-200 bg-white px-3.5 py-2.5 text-left text-xs leading-relaxed text-[var(--ink)] shadow-[0_8px_24px_-12px_rgba(11,59,50,0.35)]`}
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0, transition: reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 24 } }}
          exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.12 } }}
        >
          <span aria-hidden="true" className={`absolute h-3 w-3 rotate-45 border-neutral-200 bg-white ${tail}`} />
          {mood === "passwordError" && <p className="font-medium">Hmm, wrong password — try again!</p>}
          {mood === "mfaError" && <p className="font-medium text-[var(--badge)]">Invalid code — try again!</p>}
          {mood === "success" && <p className="font-semibold text-[var(--forest)]">Welcome to terpDESK!</p>}
          {mood === "wrongPortal" && portal && (
            <>
              <p>{WRONG_PORTAL_MESSAGES[portal]}</p>
              <Link href={otherPortalHref(portal)} className="mt-1.5 inline-block font-semibold text-[var(--forest)] underline underline-offset-4 hover:text-[var(--forest-hover)]">
                Go to the {other} sign-in →
              </Link>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
