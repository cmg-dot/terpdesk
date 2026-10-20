import { getMyProfile } from "@/app/actions/interpreterProfile";
import { ProfileOverviewTab } from "@/components/profile/ProfileOverviewTab";

export const metadata = { title: "My Profile | terpDESK" };
export const dynamic = "force-dynamic";

export default async function MyProfilePage() {
  // The middleware requires an interpreter session; the action scopes everything to it.
  const result = await getMyProfile();

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 p-6 pb-24 antialiased">
      <div className="space-y-2">
        <h1 className="text-[28px] font-semibold tracking-tight text-[var(--ink)]">My Profile</h1>
        <p className="text-[15px] text-[var(--sage)]">How you appear to the agencies you work with.</p>
      </div>

      {/* Only the Overview tab exists in this phase; more tabs can join this bar later. */}
      <nav aria-label="Profile sections" className="flex flex-wrap gap-3">
        <span
          aria-current="page"
          className="rounded-full border border-[#0B3B32] bg-[var(--forest)] px-5 py-2 text-sm font-medium text-[var(--canvas)]"
        >
          Overview
        </span>
      </nav>

      {result.success ? (
        <ProfileOverviewTab initialProfile={result.profile} />
      ) : (
        <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          {result.error}
        </div>
      )}
    </div>
  );
}
