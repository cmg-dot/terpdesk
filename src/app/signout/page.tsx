import type { Metadata } from "next";
import { LoginShell } from "@/components/auth/LoginShell";
import { SignOutPageActions } from "@/components/auth/SignOutPageActions";
import { SIGN_OUT_TEXT, SIGN_OUT_TITLE } from "@/lib/auth/messages";

export const metadata: Metadata = { title: "Sign out | terpDESK", robots: { index: false, follow: false } };

/**
 * NextAuth sends anyone who opens its sign-out URL here (`pages.signOut`), instead of its own unstyled
 * "Are you sure you want to sign out?" page. Public on purpose: signing out must work from any state.
 */
export default function SignOutPage() {
  return (
    <LoginShell title={SIGN_OUT_TITLE} subtitle={SIGN_OUT_TEXT}>
      <SignOutPageActions />
    </LoginShell>
  );
}
