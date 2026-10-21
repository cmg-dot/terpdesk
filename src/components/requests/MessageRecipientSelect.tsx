"use client";

import type { MessageRecipient } from "@/utils/messageRecipients";

/**
 * "Send this message to" for a team job: the agency's message goes to ONE booked interpreter (the one being replied
 * to), never the whole team. Hidden when only one interpreter is booked (they are the recipient).
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
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-[#0B3B32]"
      >
        <option value="">Choose an interpreter…</option>
        {recipients.map((r) => (
          <option key={r.interpreterId} value={r.interpreterId}>{r.label}</option>
        ))}
      </select>
      <p className="mt-1 text-[11px] text-gray-500">Only this interpreter receives the message. Every booked interpreter is still told about changed job details.</p>
    </div>
  );
}
