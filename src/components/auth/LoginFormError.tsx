import Link from "next/link";
import { loginPathForRole } from "@/lib/auth/routes";
import type { AppRole } from "@/lib/auth/routes";
import { WRONG_PORTAL_MESSAGES } from "@/lib/auth/messages";

/** The sign-in form's error box. A wrong-portal refusal also links to the other portal's sign-in. */
export const LoginFormError = ({ message, portal }: { message: string | null; portal: AppRole }) => {
  if (!message) return null;
  const otherPortal: AppRole = portal === "agency" ? "interpreter" : "agency";
  return (
    <div role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-left text-xs text-red-700">
      <p>{message}</p>
      {message === WRONG_PORTAL_MESSAGES[portal] && (
        <Link href={loginPathForRole(otherPortal)} className="mt-1.5 inline-block font-semibold underline underline-offset-2">
          Go to the {otherPortal} sign-in
        </Link>
      )}
    </div>
  );
};
