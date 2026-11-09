"use client";

import { useEffect, useState } from "react";
import { IDLE_LOGIN_REASON } from "@/lib/auth/idle";
import { IDLE_SIGNED_OUT_MESSAGE } from "@/lib/auth/messages";

/**
 * The notice on the sign-in pages after an idle sign-out (`?reason=idle`). Read after mount so the server and the first
 * client render match, the same way the rest of the sign-in form reads its query string.
 */
export const IdleNotice = () => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(new URLSearchParams(window.location.search).get("reason") === IDLE_LOGIN_REASON);
  }, []);
  if (!show) return null;
  return (
    <p role="status" data-idle-notice className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs leading-relaxed text-amber-900">
      {IDLE_SIGNED_OUT_MESSAGE}
    </p>
  );
};
