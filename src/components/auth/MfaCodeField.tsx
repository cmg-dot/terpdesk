import type { UseFormRegisterReturn } from "react-hook-form";

interface MfaCodeFieldProps {
  registration: UseFormRegisterReturn;
  recovery: boolean;
  disabled: boolean;
  error?: string;
}

const BASE =
  "w-full rounded-full bg-neutral-100 px-4 py-3 text-center font-mono tabular-nums text-[var(--ink)] outline-none transition-colors placeholder:text-slate-300 focus:bg-neutral-200 focus:ring-2 focus:ring-[rgb(var(--forest-rgb)/0.2)]";
// The wide letter spacing also trails the last digit, so the text is indented by the same amount to stay centred.
const CODE = `${BASE} text-2xl tracking-[0.45em] indent-[0.45em]`;
const RECOVERY = `${BASE} text-base tracking-widest placeholder:tracking-normal`;

/**
 * The code input of the two-step verification card: the 6-digit code from the authenticator app, or (one click away) a recovery
 * code for a lost phone.
 */
export const MfaCodeField = ({ registration, recovery, disabled, error }: MfaCodeFieldProps) => (
  <div className="space-y-1.5">
    <label htmlFor="mfa-code" className="sr-only">
      {recovery ? "Recovery code" : "Authentication code"}
    </label>
    <input
      id="mfa-code"
      type="text"
      autoComplete="one-time-code"
      inputMode={recovery ? "text" : "numeric"}
      maxLength={recovery ? 24 : 7}
      autoCapitalize="characters"
      spellCheck={false}
      placeholder={recovery ? "Recovery code" : "······"}
      disabled={disabled}
      aria-describedby={recovery ? "mfa-code-help" : undefined}
      {...registration}
      className={recovery ? RECOVERY : CODE}
    />
    {error && <p className="text-xs text-red-500">{error}</p>}
    {/* The card's subtitle already explains the 6-digit code; a recovery code needs a word more. */}
    {recovery && (
      <p id="mfa-code-help" className="text-xs leading-relaxed text-[var(--sage)]">
        Use one of the recovery codes you saved when you turned on two-step verification. Each works once.
      </p>
    )}
  </div>
);
