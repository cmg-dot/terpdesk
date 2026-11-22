/**
 * The notification kinds that are also shown as persistent top banners (and, since Phase 33, as a floating pop-up when one arrives).
 * Pure, so the client components and the server share one list; lib/notifications.ts re-exports them.
 */

/**
 * Notices an interpreter also sees on the dismissible banner at the top of Home and Jobs (lib/scheduleBanners.ts): a booking added
 * to their schedule by the agency, one taken off it by a cancellation or by staff removing them from it, one whose date or time the
 * agency moved, or the agency's answer to their question. Every other notice is bell-only (kind NULL).
 */
export const SCHEDULE_BANNER_KINDS = ["booking_added", "booking_cancelled", "booking_removed", "booking_time_changed", "question_answered"] as const;
export type ScheduleBannerKind = (typeof SCHEDULE_BANNER_KINDS)[number];

/**
 * Notices agency staff also see on the persistent banner at the top of their workspace (components/agency/AgencyBanners.tsx): an
 * interpreter accepted or declined an offer, an offer ran out of time, or an interpreter asked a question. Each staff member closes
 * their own.
 */
export const AGENCY_BANNER_KINDS = ["offer_accepted", "offer_declined", "offer_expired", "offer_question"] as const;
export type AgencyBannerKind = (typeof AGENCY_BANNER_KINDS)[number];

export type AlertAudience = "agency" | "interpreter";

/** The high-signal kinds that also pop up as a toast for this audience (everything else stays bell-only). */
export const toastKindsFor = (audience: AlertAudience): readonly string[] => (audience === "agency" ? AGENCY_BANNER_KINDS : SCHEDULE_BANNER_KINDS);
