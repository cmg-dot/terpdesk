"use client";

import { forwardRef, useState } from "react";
import type { InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Told whenever the eye button shows or hides the password. */
  onVisibilityChange?: (visible: boolean) => void;
};

/**
 * Password field with a show/hide eye button. Defined once at module level (never inside another
 * component's render) so it keeps its identity and the input never loses focus while typing.
 * `forwardRef` keeps it compatible with react-hook-form's `register`.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(({ className = "", onVisibilityChange, ...props }, ref) => {
  const [visible, setVisible] = useState(false);
  const toggle = () => {
    const next = !visible;
    setVisible(next);
    onVisibilityChange?.(next);
  };

  return (
    <div className="relative">
      <input ref={ref} type={visible ? "text" : "password"} className={`${className} pr-12`} {...props} />
      <button
        type="button"
        onClick={toggle}
        disabled={props.disabled}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-3 flex items-center rounded-full px-1 text-gray-400 transition-colors hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--forest-rgb)/0.4)] disabled:opacity-50"
      >
        {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  );
});

PasswordInput.displayName = "PasswordInput";
