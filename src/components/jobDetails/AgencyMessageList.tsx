import type { AgencyMessage } from "@/lib/requestActivity";

/** Messages the agency sent this interpreter, newest first. Presentational (no hooks): used by the app and the secure page. */
export function AgencyMessageList({ messages, timeZone }: { messages: AgencyMessage[]; timeZone?: string }) {
  if (messages.length === 0) return <p className="text-[14px] text-gray-600">No messages from the agency about this job.</p>;
  const when = (iso: string): string => {
    try {
      return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", ...(timeZone ? { timeZone, timeZoneName: "short" } : {}) }).format(new Date(iso));
    } catch {
      return new Date(iso).toLocaleString();
    }
  };
  return (
    <ul className="space-y-3">
      {messages.map((m) => (
        <li key={m.id} className="rounded-xl border-l-4 border-[#0B3B32] bg-gray-50 px-4 py-3">
          <p className="whitespace-pre-line text-[14px] text-gray-800">{m.text}</p>
          <p className="mt-1 text-xs text-gray-500">
            {when(m.sentAt)}
            {m.from ? ` · ${m.from}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}
