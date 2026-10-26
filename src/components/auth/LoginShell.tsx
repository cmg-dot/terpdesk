import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";

/**
 * Shared frame for the sign-in pages: logo, a card with the portal's heading, and the demo footer.
 * `eyebrow` names the workspace the portal opens ("Agency workspace" / "Interpreter workspace").
 */
export function LoginShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] w-full bg-[var(--canvas)] flex flex-col items-center justify-center p-4 font-sans text-[var(--ink)]">
      <div className="mb-4 flex flex-col items-center text-center">
        <Logo className="mb-2" />
        <p className="text-lg lg:text-xl text-slate-700">Your interpreting business. One place.</p>
      </div>

      <main className="w-full max-w-[90vw] lg:max-w-md rounded-2xl border border-neutral-100 bg-white p-6 lg:p-8">
        <header className="mb-6">
          {eyebrow && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--forest)]">{eyebrow}</p>}
          <h1 className="text-xl font-semibold tracking-tight text-[var(--ink)]">{title}</h1>
          <p className="mt-1.5 text-xs lg:text-sm leading-relaxed text-[var(--sage)]">{subtitle}</p>
        </header>
        {children}
      </main>

      <div className="mt-6 text-center text-xs lg:text-sm text-slate-700">
        <p>
          Curious about terpDESK?{" "}
          <Link href="/demo" className="font-medium text-slate-700 underline decoration-slate-400 underline-offset-4 hover:text-[var(--ink)]">
            Explore the demo
          </Link>{" "}
          — fictional sample data, nothing saved.
        </p>
      </div>
    </div>
  );
}

/** Small text link used under the sign-in forms. */
export const LoginLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className="text-[var(--sage)] underline decoration-slate-300 underline-offset-4 hover:text-slate-800">
    {children}
  </Link>
);
