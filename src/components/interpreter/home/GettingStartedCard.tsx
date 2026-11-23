import { StandaloneSteps } from "@/components/interpreter/StandaloneSteps";

/**
 * Shown on the interpreter Home to someone with no approved agency connection: what to do now, instead of a screen of zeros.
 * `null` connection count (still loading) renders nothing, so a connected interpreter never sees it flash.
 */
export function GettingStartedCard({ connectedAgencyCount }: { connectedAgencyCount: number | null }) {
  if (connectedAgencyCount !== 0) return null;
  return (
    <section data-getting-started="" aria-labelledby="getting-started-title" className="space-y-4 rounded-2xl border border-[var(--forest-soft)]/20 bg-[var(--tint)] p-5 sm:p-6">
      <div className="space-y-1">
        <h2 id="getting-started-title" className="text-lg font-semibold text-[var(--tint-ink)]">Getting started</h2>
        <p className="text-[14px] text-[var(--sage)]">
          You are not connected to an agency yet. Set up your calendar and profile now, and connect with an agency to start receiving offers.
        </p>
      </div>
      <StandaloneSteps connected={false} />
      <p className="text-[13px] text-[var(--sage)]">
        <span className="font-semibold text-[var(--ink)]">About hours and mileage: </span>
        hours and miles you submit for an agency job appear on Jobs and Mileage. A log for jobs you do outside an agency is not available yet.
      </p>
    </section>
  );
}
