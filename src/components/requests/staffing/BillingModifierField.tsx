"use client";

import { useId, useState } from "react";
import { setBillingModifier } from "@/app/actions/setBillingFields";
import { BILLING_MODIFIERS, BILLING_MODIFIER_LABEL, asBillingModifier } from "@/lib/validation/billingFields";
import type { BillingModifier } from "@/lib/validation/billingFields";

interface Props {
  requestId: string;
  /** The modifier saved on the job (intake.billingModifier); empty when there is none. */
  value: BillingModifier | "";
  /** Called with the saved modifier so the page can keep its copy of the job in step. */
  onSaved: (modifier: BillingModifier | "") => void;
}

/**
 * The billing modifier selector beside the client's date of birth in Staffing: U3 (mental health) or U9 (medical). It saves the moment
 * it changes, without opening Edit assignment (locked while an offer is out or an interpreter is booked). For agency billing only: it
 * is never shown to interpreters or put in an email, a link or a notification. "None" removes it.
 */
export function BillingModifierField({ requestId, value, onSaved }: Props) {
  const [saved, setSaved] = useState<BillingModifier | "">(value);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const selectId = useId();

  const change = async (next: BillingModifier | "") => {
    if (saving || next === saved) return;
    const previous = saved;
    setSaved(next);
    setSaving(true);
    setMessage(null);
    const result = await setBillingModifier({ requestId, modifier: next }).catch(() => ({ success: false as const, error: "We could not save the billing modifier. Please try again." }));
    setSaving(false);
    if (!result.success) {
      setSaved(previous);
      setMessage({ kind: "error", text: result.error });
      return;
    }
    setMessage({ kind: "ok", text: result.modifier === "" ? "Billing modifier removed." : "Billing modifier saved." });
    onSaved(result.modifier);
  };

  return (
    <div data-billing-modifier-field="" className="rounded-xl border border-gray-200 bg-[#FBFAF7] p-4">
      <label htmlFor={selectId} className="block text-sm font-medium text-[var(--ink)]">
        Billing modifier <span className="font-normal text-[var(--sage)]">(optional, agency billing only)</span>
      </label>
      <select
        id={selectId}
        value={saved}
        disabled={saving}
        onChange={(event) => void change(asBillingModifier(event.target.value))}
        className="mt-2 w-full rounded-full border-none bg-white px-4 py-2.5 text-sm text-gray-800 outline-none ring-1 ring-gray-200 transition-shadow focus:ring-2 focus:ring-[var(--forest)] disabled:opacity-60"
      >
        <option value="">None</option>
        {BILLING_MODIFIERS.map((code) => (
          <option key={code} value={code}>{BILLING_MODIFIER_LABEL[code]}</option>
        ))}
      </select>
      <p role="status" aria-live="polite" className={`mt-2 min-h-[1.25rem] text-xs ${message?.kind === "error" ? "text-red-700" : "text-emerald-800"}`}>
        {saving ? "Saving…" : message?.text ?? ""}
      </p>
    </div>
  );
}
