import { getMyPrepMaterials } from "@/app/actions/fileAccess";
import { PrepMaterialsTab } from "@/components/prep/PrepMaterialsTab";
import { logError } from "@/lib/logError";
import type { InterpreterPrepFile } from "@/lib/validation/file";

export const metadata = { title: "Prep | terpDESK" };
export const dynamic = "force-dynamic";

export default async function PrepPage() {
  // The middleware requires an interpreter session; the action limits files to jobs they are booked on.
  let files: InterpreterPrepFile[] = [];
  let unavailable = false;
  try {
    files = await getMyPrepMaterials();
  } catch (err) {
    // Typically a login not yet linked to an interpreter profile.
    logError("PrepPage", err);
    unavailable = true;
  }

  return (
    <div className="mx-auto w-full max-w-[1000px] space-y-6 p-4 pb-24 antialiased sm:p-6">
      <div className="space-y-2">
        <h1 className="text-[28px] font-semibold tracking-tight text-[var(--ink)]">Prep</h1>
        <p className="text-[15px] text-[var(--sage)]">Materials agencies have shared for your booked jobs.</p>
      </div>
      {unavailable ? (
        <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          We couldn&apos;t load your prep materials. If you just signed up, confirm your email first, then refresh.
        </div>
      ) : (
        <PrepMaterialsTab files={files} />
      )}
    </div>
  );
}
