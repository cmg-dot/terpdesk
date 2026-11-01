import { AlertTriangle, Ban } from "lucide-react";
import type { OfferBlock } from "@/lib/offerAvailability";

const TONES: Record<OfferBlock["tone"], { box: string; icon: string; Icon: typeof Ban }> = {
  red: { box: "border-red-200 bg-red-50 text-red-900", icon: "text-red-600", Icon: Ban },
  amber: { box: "border-amber-200 bg-amber-50 text-amber-900", icon: "text-amber-600", Icon: AlertTriangle },
};

/** Why "Create offer" is disabled for the chosen interpreter. */
export const OfferBlockedNotice = ({ block }: { block: OfferBlock }) => {
  const { box, icon, Icon } = TONES[block.tone];
  return (
    <p role="alert" className={`mt-3 flex items-start gap-2.5 rounded-xl border p-3.5 text-xs leading-relaxed ${box}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${icon}`} aria-hidden="true" />
      <span>{block.message}</span>
    </p>
  );
};
