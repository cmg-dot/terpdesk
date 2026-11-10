"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createOffer } from "@/app/actions/createOffer";
import type { InterpreterFitStatus } from "@/app/actions/availability";
import { offerBlock } from "@/lib/offerAvailability";
import { DEFAULT_OFFER_EXPIRY_HOURS, checkOfferExpiry, defaultOfferExpiry } from "@/lib/offerExpiry";
import type { PositionId } from "@/lib/positions";
import { parseSafeDate } from "@/lib/requestDetailsFormat";
import { resolveJobZone } from "@/utils/timezone";

/** One position's offer form: who the offer goes to, the response window, and the outcome of the last send. */
export interface OfferFormState {
  recipient: string;
  expiryHours: string;
  expiryMinutes: string;
  errorMessage: string;
  successMessage: string;
  isSending: boolean;
}

const blank = (): OfferFormState => ({
  recipient: "",
  expiryHours: String(DEFAULT_OFFER_EXPIRY_HOURS),
  expiryMinutes: "0",
  errorMessage: "",
  successMessage: "",
  isSending: false,
});

interface Args {
  requestId: string;
  /** The agency list's row for the job (null until loaded). */
  request: any;
  /** The job's active positions. */
  ids: readonly PositionId[];
  dbInterpreters: { id: string; name?: string; email?: string }[];
  fits: Record<string, InterpreterFitStatus>;
  /** Re-reads the job after an offer is sent. */
  reload: () => Promise<void>;
  toast: (message: string) => void;
}

/**
 * The offer forms of every position on the request page, keyed by the stable position id: choosing a recipient, the response
 * window (24 hours unless the job starts sooner; staff's own edits are never overwritten), sending the offer and its email, and
 * the "Directly assign" pause. One person can be picked in only one position at a time.
 */
export function usePositionOfferForms({ requestId, request, ids, dbInterpreters, fits, reload, toast }: Args) {
  const [forms, setForms] = useState<Record<number, OfferFormState>>({});
  const [engaged, setEngaged] = useState<Record<number, boolean>>({});
  const edited = useRef<Record<number, boolean>>({});

  const formOf = (id: PositionId): OfferFormState => forms[id] ?? blank();
  const patch = useCallback((id: PositionId, change: Partial<OfferFormState>) => {
    setForms((prev) => ({ ...prev, [id]: { ...(prev[id] ?? blank()), ...change } }));
  }, []);

  // Pre-fill: refreshed when a recipient is picked, because whether 24 hours still fits before the appointment depends on the time of day.
  const applyDefaultExpiry = useCallback(
    (id: PositionId) => {
      if (!request || edited.current[id]) return;
      const fields = defaultOfferExpiry(new Date(), parseSafeDate(request.startsAt));
      // Appointment closer than 24 hours: no ready-made value (it would be refused), so staff type a shorter window.
      patch(id, { expiryHours: fields?.hours ?? "", expiryMinutes: fields?.minutes ?? "" });
    },
    [request, patch],
  );
  const idsKey = ids.join(",");
  useEffect(() => {
    ids.forEach(applyDefaultExpiry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyDefaultExpiry, idsKey]);

  const recipients: Record<number, string> = Object.fromEntries(ids.map((id) => [id, formOf(id).recipient]));

  const setRecipientFor = (id: PositionId, value: string) => {
    // One way to book at a time: while an interpreter is picked in "Directly assign" the offer form is paused.
    if (value && engaged[id]) return;
    if (value) applyDefaultExpiry(id);
    setForms((prev) => {
      const next: Record<number, OfferFormState> = { ...prev, [id]: { ...(prev[id] ?? blank()), recipient: value } };
      // The same person can't be picked in two positions.
      if (value) for (const other of ids) if (other !== id && next[other]?.recipient === value) next[other] = { ...next[other], recipient: "" };
      return next;
    });
  };

  const setExpiry = (id: PositionId, next: { hours: string; minutes: string }) => {
    edited.current[id] = true;
    patch(id, { expiryHours: next.hours, expiryMinutes: next.minutes, errorMessage: "" });
  };

  const send = async (id: PositionId) => {
    const form = formOf(id);
    patch(id, { errorMessage: "", successMessage: "" });
    const fail = (message: string) => patch(id, { errorMessage: message });

    if (!form.recipient) return fail("Please select an interpreter to send the offer to.");

    // The window is sent as minutes; the server turns it into the absolute deadline (this check just fails fast).
    const expiry = checkOfferExpiry({ hours: form.expiryHours, minutes: form.expiryMinutes, now: new Date(), timeZone: resolveJobZone(request), startsAt: parseSafeDate(request?.startsAt) });
    if (!expiry.ok) return fail(expiry.message);

    const selected = dbInterpreters.find((i) => i.id === form.recipient);
    if (!selected?.email) return fail("Unable to find an email address for the selected interpreter.");

    // Same rule as the disabled button (and the server): no standard offer to someone unavailable / outside hours.
    const block = offerBlock(fits[form.recipient], selected.name ?? "This interpreter");
    if (block) return fail(block.message);

    patch(id, { isSending: true });
    try {
      // 1. Create the offer in the database (refused for past jobs and bad deadlines, with a readable reason)
      const created = await createOffer({ requestId, interpreterId: form.recipient, expiresInMinutes: expiry.totalMinutes, positionIndex: id });
      if (!created.success) throw new Error(created.error);

      // 2. Dispatch offer email with magic link
      const res = await fetch("/api/offers/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interpreterId: form.recipient, requestId, interpreterEmail: selected.email, positionNumber: id }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || "Failed to dispatch offer email");

      // 3. Re-read the job to get the updated offers list
      await reload();
      toast("Offer emailed successfully");
      // The next offer for this position starts from a fresh 24-hour default again.
      edited.current[id] = false;
      patch(id, { errorMessage: "", successMessage: "Offer emailed successfully", recipient: "", expiryHours: String(DEFAULT_OFFER_EXPIRY_HOURS), expiryMinutes: "0" });
    } catch (error) {
      console.error("[Offer Dispatch] Error creating or sending offer:");
      fail(error instanceof Error ? error.message : "Failed to create offer. Please try again.");
    } finally {
      patch(id, { isSending: false });
    }
  };

  return {
    formOf,
    recipients,
    engaged,
    setRecipientFor,
    setExpiry,
    send,
    clearRecipient: (id: PositionId) => patch(id, { recipient: "" }),
    setEngaged: (id: PositionId, value: boolean) => setEngaged((prev) => (prev[id] === value ? prev : { ...prev, [id]: value })),
  };
}
