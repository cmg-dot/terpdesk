import { Check } from "lucide-react";

/** The sign-in button's words: the step's own label, "Signing in..." while checking, then a check and "Welcome!" once signed in. */
export const SubmitLabel = ({ welcomed, busy, idle }: { welcomed: boolean; busy: boolean; idle: string }) =>
  welcomed ? (
    <>
      <Check className="h-4 w-4" aria-hidden="true" />
      Welcome!
    </>
  ) : (
    <>{busy ? "Signing in..." : idle}</>
  );
