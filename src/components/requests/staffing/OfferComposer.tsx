"use client";

import { InterpreterFitBadge, FitWarningNotice } from "@/components/scheduling-ui";
import { OfferBlockedNotice } from "@/components/requests/OfferBlockedNotice";
import { OfferExpiryInput } from "@/components/requests/OfferExpiryInput";
import { pastOfferNote } from "@/components/requests/ExpiredOfferNotice";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { offerBlock } from "@/lib/offerAvailability";
import type { InterpreterFitStatus } from "@/app/actions/availability";
import type { PositionView, StaffingActions, StaffingContext } from "@/components/requests/staffing/staffingTypes";

/** End-of-row status in the recipient list: the same badge the Directly assign list shows, or why there is none yet. */
function FitTrailing({ fit, loading, failed }: { fit: InterpreterFitStatus | undefined; loading: boolean; failed: boolean }) {
  if (fit) return <InterpreterFitBadge fit={fit} showIcon={false} />;
  if (loading) return <span className="text-xs text-gray-400">Checking…</span>;
  return failed ? <span className="text-xs text-gray-400">Check failed</span> : null;
}

interface Props {
  view: PositionView;
  ctx: StaffingContext;
  actions: StaffingActions;
}

/** "Offer this position": pick one interpreter, set how long they have to answer, and send the offer. */
export function OfferComposer({ view, ctx, actions }: Props) {
  const { posIdx, roster, pastOffers, offerLocked, isSending, errorMessage: errMsg, successMessage: successMsg } = view;
  const rec = view.recipient;
  // A standard offer needs an interpreter who isn't unavailable / outside usual hours (the server checks too).
  const recFit = rec ? ctx.fits[rec] : undefined;
  const recBlock = rec ? offerBlock(recFit, roster.find((i) => i.id === rec)?.name ?? 'This interpreter') : null;
  const recChecking = Boolean(rec) && !recFit && ctx.fitsLoading;
  const offerDisabled = !rec || isSending || Boolean(recBlock) || recChecking;

  return (
    <fieldset
      disabled={offerLocked}
      aria-disabled={offerLocked}
      className={`m-0 min-w-0 border-0 p-0 transition-opacity ${offerLocked ? 'opacity-50' : ''}`}
    >
      {offerLocked && (
        <p role="status" className="mb-3 text-xs font-medium text-gray-700">
          Offers are paused while an interpreter is selected in &ldquo;Directly assign&rdquo; below. Clear that selection to send an offer instead.
        </p>
      )}
      <label className="flex items-start gap-3 cursor-pointer mb-6">
        <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[var(--forest)] focus:ring-[var(--forest)]" />
        <span className="text-sm text-gray-700">Deliberately offer this slot to multiple interpreters</span>
      </label>

      <div className="space-y-4">
        <div>
          <SearchableSelect
            label="Select one recipient"
            placeholder="Search by name or email"
            emptyText="No interpreters match your search."
            value={rec}
            onChange={(id) => actions.setRecipient(posIdx, id)}
            options={roster.map((interpreter) => ({
              id: interpreter.id,
              label: interpreter.name,
              description: [interpreter.email, pastOfferNote(pastOffers, interpreter.id, ctx.isAppointmentFinished, ctx.nowMs)].filter(Boolean).join(' · ') || undefined,
              trailing: <FitTrailing fit={ctx.fits[interpreter.id]} loading={ctx.fitsLoading} failed={Boolean(ctx.fitsError)} />,
            }))}
          />
          {/* Unavailable / outside usual hours stop the offer; the Directly assign panel below ignores this. */}
          {recBlock && <OfferBlockedNotice block={recBlock} />}
          {rec && !recBlock && (
            recChecking
              ? <p role="status" className="mt-2 text-xs text-gray-500">Checking availability…</p>
              : <FitWarningNotice fit={recFit} />
          )}
          {ctx.fitsError && (
            <p className="mt-2 text-xs text-red-700" role="alert">
              Unable to load interpreter availability: {ctx.fitsError}
            </p>
          )}
        </div>

        <div>
          <OfferExpiryInput
            hours={view.expiryHours}
            minutes={view.expiryMinutes}
            nowMs={ctx.nowMs}
            timeZone={ctx.jobZone}
            startsAt={ctx.startsAt}
            disabled={offerLocked}
            onChange={(next) => actions.setExpiry(posIdx, next)}
          />
          <p className="text-xs text-[var(--sage)] mt-2 mb-2">Defaults to 24 hours; it must end before the appointment starts. An offer email with a secure zero-login magic link will be dispatched to the interpreter.</p>
          {errMsg && <p className="text-[#C23B22] text-sm mb-4">{errMsg}</p>}
          {successMsg && (
            <p className="text-[#059669] text-sm mb-4 font-medium flex items-center gap-1.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {successMsg}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => actions.createOffer(posIdx)}
          disabled={offerDisabled}
          title={recBlock?.message}
          className={`rounded-full px-6 py-2 text-sm font-medium transition-colors mt-2 w-auto flex items-center gap-2 ${
            offerDisabled
              ? 'bg-[var(--sidebar-muted)] text-white opacity-50 cursor-not-allowed'
              : 'bg-[var(--forest-bright)] text-white hover:bg-[var(--forest-bright-hover)] cursor-pointer'
          }`}
        >
          {isSending ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
              </svg>
              <span>Sending offer...</span>
            </>
          ) : (
            'Create offer'
          )}
        </button>
      </div>
    </fieldset>
  );
}
