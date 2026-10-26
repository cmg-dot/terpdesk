import Link from "next/link";

/**
 * Where the Privacy Policy and Terms & Conditions are reachable from inside the app. The links open in a new tab so
 * nobody loses a half-filled form or their place in the dashboard.
 */
const newTab = { target: "_blank", rel: "noopener noreferrer" } as const;

/** One line under the submit button of a sign-in or sign-up form. */
export function AgreementNotice({ className = "" }: { className?: string }) {
  const link = "underline underline-offset-2 hover:text-[var(--forest)] focus-visible:text-[var(--forest)]";
  return (
    <p className={`text-xs leading-relaxed text-[var(--sage)] ${className}`}>
      By continuing, you agree to our{" "}
      <Link href="/terms" {...newTab} className={link}>
        Terms &amp; Conditions
      </Link>{" "}
      and{" "}
      <Link href="/privacy" {...newTab} className={link}>
        Privacy Policy
      </Link>
      .
    </p>
  );
}

const TONES = {
  // The green desktop sidebar.
  dark: "text-[#8BA49E]/80 hover:text-white focus-visible:text-white",
  // The white mobile menu.
  light: "text-slate-400 hover:text-slate-700 focus-visible:text-slate-700",
} as const;

/** Small, quiet "Terms · Privacy" row tucked at the very bottom of a navigation menu. */
export function NavLegalLinks({ tone, className = "", onNavigate }: { tone: keyof typeof TONES; className?: string; onNavigate?: () => void }) {
  const link = `underline-offset-2 transition-colors hover:underline ${TONES[tone]}`;
  return (
    <nav aria-label="Legal" className={`flex items-center gap-2 text-xs ${className}`}>
      <Link href="/terms" {...newTab} onClick={onNavigate} className={link}>
        Terms
      </Link>
      <span aria-hidden="true" className={tone === "dark" ? "text-white/20" : "text-slate-300"}>
        ·
      </span>
      <Link href="/privacy" {...newTab} onClick={onNavigate} className={link}>
        Privacy
      </Link>
    </nav>
  );
}
