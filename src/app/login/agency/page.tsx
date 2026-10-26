import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";
import { LoginLink, LoginShell } from "@/components/auth/LoginShell";

export const metadata: Metadata = { title: "Agency sign-in | terpDESK" };

/**
 * Agency portal. Agency accounts are set up by terpDESK administrators, so there is no self-registration here.
 * Interpreter accounts are refused by the server with a pointer to the interpreter sign-in.
 */
export default function AgencyLoginPage() {
  return (
    <LoginShell
      eyebrow="Agency workspace"
      title="Agency sign-in"
      subtitle="For agency owners and staff: requests, offers, interpreters, hours review and billing."
    >
      <LoginForm portal="agency" />
      <div className="mt-6 space-y-3 text-xs lg:text-sm leading-relaxed text-[var(--sage)]">
        <p>Agency accounts are created by terpDESK. To get access, contact your terpDESK administrator.</p>
        <p>
          <LoginLink href="/reset-password">Email me a password reset link</LoginLink>
        </p>
        <p>
          Are you an interpreter? <LoginLink href="/login/interpreter">Use the interpreter sign-in</LoginLink>
        </p>
      </div>
    </LoginShell>
  );
}
