"use client";

import { Check, Circle } from "lucide-react";
import { PASSWORD_RULES } from "@/lib/validation/password";

/** Live checklist under a password input; each rule turns green with a check as it is satisfied. */
export const PasswordRequirements = ({ password }: { password: string }) => (
  <ul className="mt-2 space-y-1 pl-2" aria-label="Password requirements">
    {PASSWORD_RULES.map((rule) => {
      const met = rule.test(password);
      return (
        <li key={rule.id} className={`flex items-center gap-1.5 text-xs ${met ? "text-green-600" : "text-gray-400"}`}>
          {met ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <Circle className="h-3 w-3 shrink-0" aria-hidden="true" />}
          <span>{rule.label}</span>
          <span className="sr-only">{met ? " (met)" : " (not met yet)"}</span>
        </li>
      );
    })}
  </ul>
);
