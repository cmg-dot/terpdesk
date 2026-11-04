/** The coloured status pill on a Requests & assignments card. */

const PILL = "rounded-full px-3 py-1 text-[11px] font-semibold";

export function RequestStatusBadge({ status }: { status: string }) {
  if (status === "Offer awaiting response" || status === "Awaiting response") {
    return <span className={`${PILL} bg-[#EAE8F4] text-[#544B84]`}>Offer awaiting response</span>;
  }
  if (status === "Unfilled / draft") {
    return <span className={`${PILL} bg-[#F4EBE0] text-[#8B6A3E]`}>Unfilled / draft</span>;
  }
  if (status === "Cancelled") {
    return <span className={`${PILL} border border-[#FCA5A5]/30 bg-[#FEF2F2] text-[#991B1B]`}>Cancelled</span>;
  }
  if (status === "Completed") {
    return <span className={`${PILL} bg-[#DDEBE5] text-[#0B3B32]`}>Completed</span>;
  }
  if (status === "Fully staffed" || status === "Booked" || status === "Assigned") {
    return <span className={`${PILL} bg-[#E6EFEA] text-[#385B52]`}>{status}</span>;
  }
  if (status === "Needs replacement") {
    return <span className={`${PILL} border border-[#FDE68A]/60 bg-[#FEF3C7] text-[#92400E]`}>Needs replacement</span>;
  }
  if (status === "Partially staffed") {
    return <span className={`${PILL} bg-[#E8F3EE] text-[#466960]`}>Partially staffed</span>;
  }
  return <span className={`${PILL} bg-[#E9E4D6] text-[#665D46]`}>{status}</span>;
}
