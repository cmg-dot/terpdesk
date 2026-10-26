"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { SignOutActions } from "@/components/auth/SignOutActions";

/** Buttons for the /signout page. Cancel goes back to where the person was (or the home page if there is no history). */
export function SignOutPageActions() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await signOut({ callbackUrl: "/login" });
    } catch {
      setBusy(false);
    }
  };
  const cancel = () => (window.history.length > 1 ? router.back() : router.push("/"));

  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <SignOutActions onCancel={cancel} onConfirm={confirm} busy={busy} />
    </div>
  );
}
