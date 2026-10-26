import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";
import { LoginLink, LoginShell } from "@/components/auth/LoginShell";

export const metadata: Metadata = { title: "Interpreter sign-in | terpDESK" };

/** Interpreter portal. Independent interpreters can create their own account; agency accounts are refused here. */
export default function InterpreterLoginPage() {
  return (
    <LoginShell
      eyebrow="Interpreter workspace"
      title="Interpreter sign-in"
      subtitle="Your jobs, calendar, prep materials and agencies in one place."
    >
      <LoginForm portal="interpreter" />
      <div className="mt-6 space-y-3 text-xs lg:text-sm leading-relaxed text-[var(--sage)]">
        <p>
          New interpreter? <LoginLink href="/register">Create an interpreter account</LoginLink> — it gives you a profile,
          not agency access.
        </p>
        <p>
          <LoginLink href="/reset-password">Email me a password reset link</LoginLink>
        </p>
        <p>
          Agency staff? <LoginLink href="/login/agency">Use the agency sign-in</LoginLink>
        </p>
      </div>
    </LoginShell>
  );
}
