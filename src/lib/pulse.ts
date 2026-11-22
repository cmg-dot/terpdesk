/**
 * The "pulse": a tiny summary of what is new for the signed-in person, read every 15 seconds while a tab is visible (and when it
 * regains focus). When it changes, the screens that show that data re-read it (banners, bell, jobs, Staffing). Pure types and rules,
 * so the server action, the client store and the tests share one definition. No names, no job details: counts and ids only.
 */

export interface Pulse {
  /** The newest notification of any kind, or null when there is none. */
  latestId: string | null;
  latestAt: string | null;
  /** Unread notifications (the bell's count). */
  unread: number;
  /** Staff: offers waiting for an answer. Interpreter: their own offers waiting for an answer. */
  openOffers: number;
  /** Staff: questions waiting for an answer (open banners). Interpreter: answers they have not closed yet. */
  openQuestions: number;
  /** The server's clock, where a new session starts counting "new" alerts from (never the browser's, which may differ). */
  serverNow: string;
}

/** What changes mean "re-read": a new notification, a different unread count, or a different number of open offers or questions. */
export const pulseSignature = (p: Pulse): string => [p.latestId ?? "", p.unread, p.openOffers, p.openQuestions].join("|");

export const PULSE_INTERVAL_MS = 15_000;

/** A pop-up for one newly arrived high-signal notification (lib/bannerKinds.ts). */
export interface AlertToast {
  id: string;
  kind: string;
  title: string;
  message: string;
  href: string | null;
  createdAt: string;
}

/** How many pop-ups stay on screen at once (the oldest leaves first), and how long each stays. */
export const MAX_TOASTS = 3;
export const TOAST_MS = 9_000;

/**
 * The toasts to show after a poll: those not shown before (by id), oldest first, and the cursor to ask from next time. The cursor only
 * moves forward. Pure.
 */
export function nextToasts(incoming: readonly AlertToast[], seen: ReadonlySet<string>, cursor: string | null): { fresh: AlertToast[]; cursor: string | null } {
  const fresh = incoming.filter((t) => !seen.has(t.id)).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const newest = incoming.reduce<string | null>((max, t) => (max === null || Date.parse(t.createdAt) > Date.parse(max) ? t.createdAt : max), cursor);
  return { fresh, cursor: newest };
}

/** Keeps the newest `max` toasts. */
export const capToasts = <T,>(list: readonly T[], max: number = MAX_TOASTS): T[] => list.slice(Math.max(0, list.length - max));
