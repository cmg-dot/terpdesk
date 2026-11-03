"use client";

import { Dropdown } from "@/components/ui/Dropdown";
import { ALL_BOOKED_RECIPIENTS } from "@/utils/messageRecipients";
import type { MessageRecipient } from "@/utils/messageRecipients";

/**
 * "Send this message to" for a team job: one booked interpreter (the one being replied to) or, chosen explicitly,
 * every booked interpreter. Hidden when only one interpreter is booked (they are the recipient).
 */
export function MessageRecipientSelect({
  id,
  recipients,
  value,
  onChange,
  className = "",
}: {
  id: string;
  recipients: MessageRecipient[];
  value: string;
  onChange: (interpreterId: string) => void;
  className?: string;
}) {
  if (recipients.length < 2) return null;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-gray-700">Send this message to</label>
      <Dropdown
        id={id}
        value={value}
        onChange={onChange}
        options={[
          { value: "", label: "Choose an interpreter…" },
          ...recipients.map((r) => ({ value: r.interpreterId, label: r.label })),
          { value: ALL_BOOKED_RECIPIENTS, label: "Send to all booked interpreters" },
        ]}
        className="w-full"
      />
      <p className="mt-1 text-[11px] text-gray-500">
        {value === ALL_BOOKED_RECIPIENTS
          ? "Every interpreter booked on this job receives the message."
          : "Only this interpreter receives the message."}{" "}
        Every booked interpreter is still told about changed job details.
      </p>
    </div>
  );
}
