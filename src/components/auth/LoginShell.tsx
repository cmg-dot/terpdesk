import type { ReactNode } from "react";
import Link from "next/link";
import { LoginBrandPanel, LoginMobileBrand } from "@/components/auth/LoginBrandPanel";
import { LoginMascotProvider } from "@/components/auth/LoginMascotContext";

const DEFAULT_BRAND_COPY = "One sign-in for agency teams and the interpreters they work with.";

/**
 * Shared frame for the sign-in pages. Wide screens split in two: the brand panel with the owl on the left, the card with the
 * portal's heading and the demo link on the right. Narrow screens show a compact logo and the owl peeking over the card.
 * `eyebrow` names the workspace the portal opens ("Agency workspace" / "Interpreter workspace"); `brandCopy` is the
 * portal's one-line pitch beside the headline. The page inherits the root font (Inter).
 */
export function LoginShell({
  eyebrow,
  title,
  subtitle,
  brandCopy = DEFAULT_BRAND_COPY,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  brandCopy?: string;
  children: ReactNode;
}) {
  return (
    <LoginMascotProvider>
      <div className="min-h-[100dvh] w-full bg-[var(--canvas)] text-[var(--ink)] lg:grid lg:grid-cols-2">
        <LoginBrandPanel copy={brandCopy} />

        <div className="flex min-h-[100dvh] flex-col items-center px-4 pb-8 pt-6 lg:justify-center lg:px-12 lg:py-8">
          <div className="w-full max-w-md">
            <LoginMobileBrand />

            <main className="relative z-10 w-full rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_40px_-20px_rgba(11,59,50,0.25)] lg:p-8">
              <header className="mb-6">
                {eyebrow && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--forest)]">{eyebrow}</p>}
                <h1 className="text-xl font-semibold tracking-tight text-[var(--ink)]">{title}</h1>
                <p className="mt-1.5 text-xs lg:text-sm leading-relaxed text-[var(--sage)]">{subtitle}</p>
              </header>
              {children}
            </main>

            <DemoFooter />
          </div>
        </div>
      </div>
    </LoginMascotProvider>
  );
}

const DemoFooter = () => (
  <div className="mt-6 text-center text-xs lg:text-sm text-slate-700">
    <p>
      Curious about terpDESK?{" "}
      <Link href="/demo" className="font-medium text-slate-700 underline decoration-slate-400 underline-offset-4 hover:text-[var(--ink)]">
        Explore the demo
      </Link>{" "}
      — fictional sample data, nothing saved.
    </p>
  </div>
);

/** Small text link used under the sign-in forms. */
export const LoginLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className="text-[var(--sage)] underline decoration-slate-300 underline-offset-4 hover:text-slate-800">
    {children}
  </Link>
);
