import { HeartPulse, User, Users } from "lucide-react";

/**
 * What an interpreter should know about an offer before accepting, as pills: a mental health appointment, and whether it is a solo
 * job or a team ("Team · 2 interpreters"). Shown on Home's offer cards and on the job page while the offer is pending.
 */
export function OfferTags({ mentalHealth, positionCount, className = "" }: { mentalHealth?: boolean; positionCount?: number; className?: string }) {
  const team = Math.max(1, positionCount ?? 1);
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`} data-offer-tags="">
      {mentalHealth && (
        <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-800" data-offer-tag="mental-health">
          <HeartPulse className="h-3.5 w-3.5" aria-hidden="true" />
          Mental Health
        </span>
      )}
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface)] px-2.5 py-0.5 text-xs font-medium text-[var(--forest-soft)]" data-offer-tag="team">
        {team > 1 ? <Users className="h-3.5 w-3.5" aria-hidden="true" /> : <User className="h-3.5 w-3.5" aria-hidden="true" />}
        {team > 1 ? `Team · ${team} interpreters` : "Solo"}
      </span>
    </div>
  );
}
