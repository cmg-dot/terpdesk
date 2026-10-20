import Link from "next/link";
import { getServerSession } from "next-auth";
import { ChangePasswordDialog } from "@/components/features/ChangePasswordDialog";
import { authOptions } from "@/lib/auth/options";

export const metadata = { title: "Settings | terpDESK" };

const rowClass = "flex flex-col gap-1 border-b border-gray-200 py-3 sm:flex-row sm:items-center sm:justify-between";

export default async function InterpreterSettingsPage() {
  // The middleware already requires an interpreter session; this only reads who it is.
  const session = await getServerSession(authOptions);

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 p-6 pb-24 antialiased">
      <div className="mb-6 space-y-2">
        <h1 className="text-[28px] font-semibold tracking-tight text-[var(--ink)]">Settings</h1>
        <p className="text-[15px] text-[var(--sage)]">Your account and how terpDESK signs you in.</p>
      </div>

      <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-[var(--ink)]">Account</h2>

        <div className={rowClass}>
          <span className="text-[14px] text-[var(--sage)]">Name</span>
          <span className="text-[14px] font-medium text-[var(--ink)]">{session?.user?.name ?? ""}</span>
        </div>
        <div className={rowClass}>
          <span className="text-[14px] text-[var(--sage)]">Sign-in email</span>
          <span className="text-[14px] font-medium text-[var(--ink)] break-all">{session?.user?.email ?? ""}</span>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/profile"
            className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-center text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Edit my profile
          </Link>
          <ChangePasswordDialog triggerClassName="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50" />
        </div>
      </section>
    </div>
  );
}
