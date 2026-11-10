"use client";

interface Props {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

/** The "require on-site sign-off" checkbox and its explanation, shared by the request forms and the request page. */
export function OnsiteSignatureToggle({ id, checked, onChange, disabled = false }: Props) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="checkbox"
          className="h-5 w-5 rounded border-gray-300 text-[var(--forest)] focus:ring-[var(--forest)] disabled:opacity-50"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <label htmlFor={id} className="text-[15px] text-gray-700 font-medium cursor-pointer">
          Require on-site contact signature
        </label>
      </div>
      <p className="mt-1 text-xs text-gray-400">
        The interpreter hands their device to the contact who was on site, who prints their name and signs to authorize the hours. Switch it off for a job that does not need it.
      </p>
    </div>
  );
}
