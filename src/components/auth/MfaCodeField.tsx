import type { UseFormRegisterReturn } from "react-hook-form";

interface MfaCodeFieldProps {
  registration: UseFormRegisterReturn;
  recovery: boolean;
  onToggleRecovery: () => void;
  disabled: boolean;
  error?: string;
}

const INPUT =
  "w-full rounded-full bg-neutral-100 px-4 py-2.5 text-sm tracking-widest outline-none transition-colors focus:bg-neutral-200 focus:ring-2 focus:ring-[rgb(var(--forest-rgb)/0.2)]";

/**
 * The second step of the sign-in form, shown after the password was right for an account with two-step verification on: the
 * 6-digit code from the authenticator app, or (one click away) a recovery code for a lost phone.
 */
export const MfaCodeField = ({ registration, recovery, onToggleRecovery, disabled, error }: MfaCodeFieldProps) => (
  <div className="space-y-1" data-mfa-step>
    <label htmlFor="mfa-code" className="block text-xs lg:text-sm text-[var(--sage)]">
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
      disabled={disabled}
      aria-describedby="mfa-code-help"
      {...registration}
      className={INPUT}
    />
    {error && <p className="text-xs text-red-500">{error}</p>}
    <p id="mfa-code-help" className="text-xs leading-relaxed text-[var(--sage)]">
      {recovery
        ? "Enter one of the recovery codes you saved when you turned on two-step verification. Each works once."
        : "Open your authenticator app and enter the 6-digit code for terpDESK."}{" "}
      <button type="button" onClick={onToggleRecovery} className="font-medium text-[var(--forest)] underline underline-offset-2">
        {recovery ? "Use my authenticator app instead" : "Use a recovery code instead"}
      </button>
    </p>
  </div>
);
