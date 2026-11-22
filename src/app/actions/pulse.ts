"use server";

import { z } from "zod";
import { requireInterpreter, requireRole } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { sweepOnPulse } from "@/lib/offerPulseSweep";
import type { AlertToast, Pulse } from "@/lib/pulse";
import { readNewAlerts, readPulse } from "@/lib/pulseRead";
import type { PulseViewer } from "@/lib/pulseRead";

/**
 * The 15-second "anything new?" check (lib/pulse.ts) and the pop-ups for newly arrived alerts. Both read only the signed-in person's
 * own notifications and offers (the session decides who that is, never the browser) and return counts and ids, or the same title and
 * message the person already sees on their banner and bell. Not signed in, or on any error: null / an empty list, never a throw.
 */

async function whoAmI(): Promise<PulseViewer | null> {
  try {
    return { userId: (await requireRole("agency")).user.id, audience: "agency", interpreterId: null };
  } catch {
    // Not staff: try the interpreter login.
  }
  try {
    const { session, interpreterId } = await requireInterpreter();
    return { userId: session.user.id, audience: "interpreter", interpreterId };
  } catch {
    return null;
  }
}

export async function getPulse(): Promise<Pulse | null> {
  const me = await whoAmI();
  if (!me) return null;
  try {
    // Staff only, at most once a minute: expires lapsed offers (and announces them) even when nobody opens that request.
    if (me.audience === "agency") await sweepOnPulse();
    return await readPulse(me);
  } catch (err) {
    logError("getPulse", err);
    return null;
  }
}

const afterInput = z.object({ after: z.string().datetime().nullable() });

/** The high-signal notices that arrived after `after`, oldest first. No `after`, or an invalid one: none. */
export async function getNewAlerts(input: { after: string | null }): Promise<AlertToast[]> {
  const me = await whoAmI();
  const parsed = afterInput.safeParse(input);
  if (!me || !parsed.success || parsed.data.after === null) return [];
  try {
    return await readNewAlerts(me, new Date(parsed.data.after));
  } catch (err) {
    logError("getNewAlerts", err);
    return [];
  }
}
