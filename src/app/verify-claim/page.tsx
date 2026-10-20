import Link from "next/link";
import { Logo } from "@/components/logo";
import { verifyClaim } from "@/app/actions/verifyClaim";

export const metadata = { title: "Verify your email | terpDESK", robots: { index: false, follow: false } };

const ERRORS: Record<string, string> = {
  invalid: "This verification link is not valid. It may already have been used.",
  // Registering again is impossible (the email is taken), so point to the resend link instead.
  expired: "This verification link has expired. Sign in and choose “Resend link” on your home page to get a new one.",
  unavailable: "We could not connect this profile. It may already be linked to an account.",
};

export default function VerifyClaimPage({ searchParams }: { searchParams: { token?: string; error?: string } }) {
  const token = typeof searchParams.token === "string" ? searchParams.token : "";
  const error = searchParams.error ? (ERRORS[searchParams.error] ?? ERRORS.invalid) : null;

  return (
    <div className="min-h-[100dvh] w-full bg-[var(--canvas)] flex flex-col items-center justify-center p-4 font-sans text-[var(--ink)]">
      <div className="mb-4 flex flex-col items-center text-center">
        <Logo className="mb-2" />
      </div>

      <div className="w-full max-w-[90vw] lg:max-w-md rounded-2xl border border-neutral-100 bg-white p-6 lg:p-8">
        <h1 className="mb-2 text-xl font-semibold">Verify your email</h1>

        {error || !token ? (
          <>
            <p role="alert" className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error ?? ERRORS.invalid}
            </p>
            <Link href="/login" className="text-sm text-[var(--sage)] underline underline-offset-4 hover:text-slate-800">
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <p className="mb-6 text-sm leading-relaxed text-[var(--sage)]">
              Confirm that this is your email to connect your account to your existing interpreter profile.
            </p>
            {/* A button (not page load) consumes the token, so link scanners cannot use it up. */}
            <form action={verifyClaim}>
              <input type="hidden" name="token" value={token} />
              <button
                type="submit"
                className="rounded-full bg-[var(--forest)] px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Confirm and connect my profile
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
