import { getCredentials } from "@/app/actions/credentials";
import { getMyProfile } from "@/app/actions/interpreterProfile";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { logError } from "@/lib/logError";
import type { MyCredential } from "@/lib/validation/credential";

export const metadata = { title: "My Profile | terpDESK" };
export const dynamic = "force-dynamic";

export default async function MyProfilePage() {
  // The middleware requires an interpreter session; the actions scope everything to it.
  const result = await getMyProfile();

  let credentials: MyCredential[] = [];
  if (result.success) {
    try {
      credentials = await getCredentials();
    } catch (err) {
      logError("MyProfilePage.credentials", err);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 p-6 pb-24 antialiased">
      <div className="space-y-2">
        <h1 className="text-[28px] font-semibold tracking-tight text-[var(--ink)]">My Profile</h1>
        <p className="text-[15px] text-[var(--sage)]">How you appear to the agencies you work with.</p>
      </div>

      {result.success ? (
        <ProfileTabs initialProfile={result.profile} initialCredentials={credentials} />
      ) : (
        <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          {result.error}
        </div>
      )}
    </div>
  );
}
