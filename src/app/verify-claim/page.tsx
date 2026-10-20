import Link from "next/link";
import { eq } from "drizzle-orm";
import { Logo } from "@/components/logo";
import { ConfirmClaimForm } from "@/components/auth/ConfirmClaimForm";
import { db } from "@/db";
import { verificationTokens } from "@/db/schema";
import { logError } from "@/lib/logError";
import { hashToken } from "@/lib/timesheetToken";

export const metadata = { title: "Verify your email | terpDESK", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invalid:
    "This verification link is not valid. It may already have been used, or a newer link may have replaced it. If you already confirmed, just sign in. Otherwise sign in and choose “Resend link” on your home page.",
  expired: "This verification link has expired. Sign in and choose “Resend link” on your home page to get a new one.",
  unavailable: "We could not connect this profile. It may already be linked to another account.",
};

const TOKEN_SHAPE = /^[a-f0-9]{64}$/;

/** Read-only check used when the page opens. It never consumes the token: only the confirm button does. */
async function linkProblem(token: string): Promise<"invalid" | "expired" | null> {
  if (!TOKEN_SHAPE.test(token)) return "invalid";
  try {
    const [row] = await db
      .select({ expires: verificationTokens.expires })
      .from(verificationTokens)
      .where(eq(verificationTokens.token, hashToken(token)))
      .limit(1);
    if (!row) return "invalid";
    return row.expires.getTime() < Date.now() ? "expired" : null;
  } catch (err) {
    // If the lookup itself fails, still show the button; the confirm step reports the real outcome.
    logError("VerifyClaimPage", err);
    return null;
  }
}

export default async function VerifyClaimPage({ searchParams }: { searchParams: { token?: string; error?: string } }) {
  const token = typeof searchParams.token === "string" ? searchParams.token : "";
  const problem = searchParams.error ? (searchParams.error in ERRORS ? searchParams.error : "invalid") : await linkProblem(token);
  const error = problem ? ERRORS[problem] : null;

  return (
    <div className="min-h-[100dvh] w-full bg-[var(--canvas)] flex flex-col items-center justify-center p-4 font-sans text-[var(--ink)]">
      <div className="mb-4 flex flex-col items-center text-center">
        <Logo className="mb-2" />
      </div>

      <div className="w-full max-w-[90vw] lg:max-w-md rounded-2xl border border-neutral-100 bg-white p-6 lg:p-8">
        <h1 className="mb-2 text-xl font-semibold">Verify your email</h1>

        {error ? (
          <>
            <p role="alert" className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
            <Link href="/login" className="text-sm text-[var(--sage)] underline underline-offset-4 hover:text-slate-800">
              Go to sign in
            </Link>
          </>
        ) : (
          <>
            <p className="mb-6 text-sm leading-relaxed text-[var(--sage)]">
              Confirm that this is your email to connect your account to your existing interpreter profile.
            </p>
            {/* Opening this page changes nothing. The button submits the claim, so link scanners cannot use the token up. */}
            <ConfirmClaimForm token={token} />
          </>
        )}
      </div>
    </div>
  );
}
