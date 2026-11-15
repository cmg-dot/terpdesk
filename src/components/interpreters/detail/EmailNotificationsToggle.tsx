"use client";

import { useState, useTransition } from "react";
import { BellOff, BellRing } from "lucide-react";
import { setInterpreterEmailNotifications } from "@/app/actions/interpreterEmailNotifications";

interface Props {
  interpreterId: string;
  name: string;
  initial: boolean;
  /** True when only the bulk-import placeholder is on file: there is nowhere to send to yet. */
  hasPlaceholderEmail: boolean;
}

/** Agency-only: the "Email notifications" switch on an interpreter's page. Saves as soon as it is flipped. */
export const EmailNotificationsToggle = ({ interpreterId, name, initial, hasPlaceholderEmail }: Props) => {
  const [enabled, setEnabled] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const flip = () => {
    const next = !enabled;
    setError(null);
    setEnabled(next);
    startSaving(async () => {
      const result = await setInterpreterEmailNotifications({ interpreterId, enabled: next });
      if (result.success) {
        setEnabled(result.enabled);
      } else {
        setEnabled(!next);
        setError(result.error);
      }
    });
  };

  const Icon = enabled ? BellRing : BellOff;
  const hint = enabled
    ? `${name} is emailed offers, booking confirmations, job updates and timesheet links.`
    : `${name} gets no emails from your agency. Offers and updates still appear in terpDESK.`;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h2 id="email-notifications-label" className="inline-flex items-center gap-2 text-lg font-semibold text-[var(--ink)]">
            <Icon className="h-4 w-4 text-gray-400" aria-hidden="true" />
            Email notifications
          </h2>
          <p id="email-notifications-hint" className="text-[13px] text-gray-600">{hint}</p>
          {hasPlaceholderEmail && (
            <p className="text-[12px] text-gray-500">No email on file yet. Add their address with Edit details first.</p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="email-notifications-label"
          aria-describedby="email-notifications-hint"
          disabled={saving}
          onClick={flip}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 ${
            enabled ? "bg-[var(--forest)]" : "bg-gray-300"
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`}
          />
        </button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{error}</p>}
    </section>
  );
};
