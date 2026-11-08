"use client";

import Link from "next/link";
import { CalendarDays, Edit2, Lock } from "lucide-react";

/**
 * The appointment's action toolbar, in three groups on one row (desktop) or a two-column grid of full-width tap targets
 * (phone):
 *  - look: View in calendar (a quiet outline pill; the original form is its own card on the page);
 *  - dispatch: Quick edit, Edit assignment (accent);
 *  - close-out: Cancel appointment, Void job (muted danger, pushed to the far end so they are never next to the accents).
 * The groups wrap as units, never button by button, so nothing hangs alone on a third line.
 */

const BASE = "inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors sm:min-h-0 sm:w-auto sm:px-3.5 sm:text-[13px]";
const LOOK = `${BASE} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`;
const ACCENT_SOFT = `${BASE} border border-emerald-200 bg-emerald-50 text-[var(--forest)] hover:bg-emerald-100`;
const ACCENT_SOLID = `${BASE} border border-transparent bg-[var(--forest)] text-white hover:bg-[var(--forest)]/90`;
const LOCKED = `${BASE} cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400`;
const DANGER = `${BASE} border border-red-200 bg-white text-[#B4443A] hover:bg-red-50`;
const NEUTRAL = `${BASE} border border-slate-200 bg-white text-slate-600 hover:bg-slate-50`;

const GROUP = "contents sm:flex sm:items-center sm:gap-2";
const DIVIDER = <span aria-hidden="true" className="hidden h-6 w-px bg-gray-200 sm:block" />;

interface Props {
  /** Where "View in calendar" goes: the calendar on this appointment's day with the job highlighted (see lib/calendarLink). */
  calendarHref?: string;
  editHref: string;
  /** Cancelled or voided: only the look group is left. */
  isCancelled: boolean;
  /** A booked interpreter locks the whole edit flow; the buttons stay visible but disabled. */
  isEditLocked: boolean;
  editLockMessage?: string;
  onQuickEdit: () => void;
  onCancel: () => void;
  onVoid: () => void;
}

export function RequestActionBar({ calendarHref = "/calendar", editHref, isCancelled, isEditLocked, editLockMessage, onQuickEdit, onCancel, onVoid }: Props) {
  return (
    <div role="toolbar" aria-label="Appointment actions" className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-x-2 sm:gap-y-2">
      <div className={GROUP}>
        <Link href={calendarHref} className={LOOK}>
          <CalendarDays className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
          View in calendar
        </Link>
      </div>

      {!isCancelled && (
        <>
          {DIVIDER}
          <div className={GROUP}>
            {isEditLocked ? (
              <>
                <button type="button" disabled title={editLockMessage} className={LOCKED}>
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  Quick edit
                </button>
                <button type="button" disabled title={editLockMessage} className={LOCKED}>
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  Edit assignment
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={onQuickEdit} className={ACCENT_SOFT}>
                  <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Quick edit
                </button>
                <Link href={editHref} className={ACCENT_SOLID}>
                  Edit assignment
                </Link>
              </>
            )}
          </div>

          <div className={`${GROUP} sm:ml-auto`}>
            <button type="button" onClick={onCancel} className={DANGER}>
              Cancel appointment
            </button>
            <button type="button" onClick={onVoid} className={NEUTRAL}>
              Void job
            </button>
          </div>
        </>
      )}
    </div>
  );
}
