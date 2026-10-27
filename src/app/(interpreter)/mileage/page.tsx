import { getInterpreterMileage } from "@/app/actions/getInterpreterMileage";
import type { InterpreterMileage } from "@/app/actions/getInterpreterMileage";
import { MileageOverview } from "@/components/features/MileageOverview";
import { logError } from "@/lib/logError";

export const metadata = { title: "Mileage | terpDESK" };
export const dynamic = "force-dynamic";

export default async function MileagePage() {
  // The middleware requires an interpreter session; the action returns only that interpreter's own jobs.
  let mileage: InterpreterMileage | null = null;
  try {
    mileage = await getInterpreterMileage();
  } catch (err) {
    // Typically a login not yet linked to an interpreter profile.
    logError("MileagePage", err);
  }

  return (
    <div className="mx-auto w-full max-w-[1000px] space-y-6 p-4 pb-24 antialiased sm:p-6">
      <div className="space-y-2">
        <h1 className="text-[28px] font-semibold tracking-tight text-[var(--ink)]">Mileage</h1>
        <p className="text-[15px] text-[var(--sage)]">
          The miles you reported on your jobs and what agencies have approved. Approval confirms the mileage only; it is not a payment.
        </p>
      </div>
      {mileage ? (
        <MileageOverview entries={mileage.entries} generatedAt={mileage.generatedAt} />
      ) : (
        <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          We couldn&apos;t load your mileage. If you just signed up, confirm your email first, then refresh.
        </div>
      )}
    </div>
  );
}
