import type { Metadata } from "next";
import { LoginLink, LoginShell } from "@/components/auth/LoginShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { ResetRequestForm } from "@/components/auth/ResetRequestForm";
import { logError } from "@/lib/logError";
import { RESET_LINK_PROBLEMS, resetLinkProblem } from "@/lib/passwordReset";
import type { ResetLinkProblem } from "@/lib/passwordReset";

// no-referrer: the link token in this page's address must never leave in a Referer header.
export const metadata: Metadata = { title: "Reset your password | terpDESK", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/** Read-only check when the page opens; never uses the token up. A failed lookup still shows the form: submitting reports the truth. */
async function checkLink(token: string): Promise<ResetLinkProblem | null> {
  try {
    return await resetLinkProblem(token);
  } catch (err) {
    logError("ResetPasswordPage", err);
    return null;
  }
}

/**
 * Public password reset for agency and interpreter logins. Without a token: ask for the address. With the emailed token: choose a new
 * password. Not in the middleware matcher, so it opens whether or not someone is signed in.
 */
export default async function ResetPasswordPage({ searchParams }: { searchParams: { token?: string | string[] } }) {
  const token = typeof searchParams.token === "string" ? searchParams.token : "";
  const problem = token ? await checkLink(token) : null;
  const choosing = Boolean(token) && !problem;

  return (
    <LoginShell
      eyebrow="Account"
      title={choosing ? "Choose a new password" : "Reset your password"}
      subtitle={
        choosing
          ? "Your new password replaces the old one, and every device that is signed in will be signed out."
          : "Enter the email you sign in with. We will email you a link to choose a new password."
      }
    >
      {problem && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {RESET_LINK_PROBLEMS[problem]}
        </p>
      )}
      {choosing ? <ResetPasswordForm token={token} /> : <ResetRequestForm />}
      <div className="mt-6 space-y-2 text-xs lg:text-sm leading-relaxed text-[var(--sage)]">
        <p>
          Remembered it? <LoginLink href="/login/agency">Agency sign-in</LoginLink> · <LoginLink href="/login/interpreter">Interpreter sign-in</LoginLink>
        </p>
      </div>
    </LoginShell>
  );
}
