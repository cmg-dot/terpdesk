"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type { UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { getSession, signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { clearClientCache } from "@/lib/clientCache";
import { homePathForRole, isAppRole, requiredRoleForPath } from "@/lib/auth/routes";
import type { AppRole } from "@/lib/auth/routes";
import { DISPLAYABLE_AUTH_MESSAGES, MFA_INVALID_MESSAGE, MFA_REQUIRED_MESSAGE, WRONG_PORTAL_MESSAGES } from "@/lib/auth/messages";
import { useSetMascotMood } from "@/components/auth/LoginMascotContext";
import type { MascotMood } from "@/lib/mascotPoses";

const loginSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address" }),
  password: z.string().min(1, { message: "Password is required" }),
  // Only used on the second step, for accounts with two-step verification on.
  code: z.string().optional(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

const INCORRECT_MESSAGE = "Incorrect email or password.";

/**
 * How the owl reacts to a refused sign-in: it points at the other portal, shakes its head at a wrong password or a wrong code, and
 * otherwise (a lockout, a used code, the service down) simply waits, with the message in the form saying what happened.
 */
const moodForRefusal = (message: string, codeStep: boolean, portal: AppRole): [MascotMood, AppRole?] => {
  if (message === WRONG_PORTAL_MESSAGES[portal]) return ["wrongPortal", portal];
  if (codeStep) return [message === MFA_INVALID_MESSAGE ? "mfaError" : "mfa"];
  return [message === INCORRECT_MESSAGE ? "passwordError" : "idle"];
};
/** How long the welcome (the owl's celebration and the tablet's "WELCOME TO terpDESK") stays up before the workspace opens. */
const WELCOME_MS = 1000;
const WELCOME_REDUCED_MS = 250;

/** The sign-in form shows one step at a time: email and password, then (for accounts with it on) the two-step code. */
export type LoginStep = "credentials" | "mfa";

export interface LoginFlow {
  form: UseFormReturn<LoginFormValues>;
  step: LoginStep;
  useRecovery: boolean;
  formError: string | null;
  justRegistered: boolean;
  verifySent: boolean;
  /** Signed in: the welcome is showing and the workspace is about to open. */
  welcomed: boolean;
  submit: ReturnType<UseFormReturn<LoginFormValues>["handleSubmit"]>;
  toggleRecovery: () => void;
  backToCredentials: () => void;
}

/** The sign-in logic of one portal. The server refuses accounts of the other role (see authorize() in auth options). */
export function useLoginFlow(portal: AppRole): LoginFlow {
  const router = useRouter();
  const setMood = useSetMascotMood();
  const [justRegistered, setJustRegistered] = useState(false);
  const [verifySent, setVerifySent] = useState(false);
  // Read after mount so the server and first client render match.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setJustRegistered(params.get("registered") === "true");
    setVerifySent(params.get("verify") === "sent");
  }, []);
  // Two-step verification: the form moves to the code step once the server says this account needs one.
  const [step, setStep] = useState<LoginStep>("credentials");
  const [useRecovery, setUseRecovery] = useState(false);
  const [welcomed, setWelcomed] = useState(false);
  const [formError, setFormError] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("error") === "forbidden"
      ? "Your account does not have access to that area. Sign in with a different account."
      : null;
  });
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", code: "" },
  });
  const { setValue, setFocus } = form;

  const onSubmit = async (data: LoginFormValues) => {
    setFormError(null);
    const needsCode = step === "mfa";
    const code = needsCode ? data.code?.trim() : undefined;
    if (needsCode && !code) {
      setFormError("Enter your code to finish signing in.");
      return;
    }
    try {
      // The `code` key is left out entirely on the first step: NextAuth sends its options through URLSearchParams, which would turn
      // `code: undefined` into the text "undefined", and the server would take that for a (wrong) typed code.
      const result = await signIn("credentials", { email: data.email, password: data.password, portal, redirect: false, ...(code ? { code } : {}) });
      if (result?.error === MFA_REQUIRED_MESSAGE) {
        // Right password, and this account has two-step verification on: ask for the code (the password stays in the form).
        setStep("mfa");
        setMood("mfa");
        return;
      }
      if (!result || result.error) {
        if (needsCode) setValue("code", "");
        // Only the lockout notice is shown verbatim; every other failure is one generic message
        // so the form never reveals whether an email exists.
        const message = result?.error && DISPLAYABLE_AUTH_MESSAGES.includes(result.error) ? result.error : INCORRECT_MESSAGE;
        setFormError(message);
        setMood(...moodForRefusal(message, needsCode, portal));
        return;
      }

      const session = await getSession();
      const role = session?.user?.role;
      if (!isAppRole(role)) {
        setFormError("Your account has no role assigned. Contact your administrator.");
        return;
      }
      if (role !== portal) {
        // The server already refuses this; never keep a session that came through the wrong portal.
        clearClientCache();
        await signOut({ redirect: false });
        setFormError(WRONG_PORTAL_MESSAGES[portal]);
        setMood("wrongPortal", portal);
        return;
      }

      // Only follow same-site callbacks this role may open (a public page, or one of its own pages).
      const callback = new URLSearchParams(window.location.search).get("callbackUrl");
      const callbackPath = callback?.split("?")[0] ?? "";
      const callbackRole = requiredRoleForPath(callbackPath);
      const safeCallback =
        callback && callback.startsWith("/") && !callback.startsWith("//") && !callbackPath.startsWith("/login") && (callbackRole === null || callbackRole === role)
          ? callback
          : null;
      // A short welcome before the workspace opens, so the confirmation is actually seen (the form stays disabled meanwhile).
      setMood("success");
      setWelcomed(true);
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      await new Promise<void>((resolve) => setTimeout(resolve, reduceMotion ? WELCOME_REDUCED_MS : WELCOME_MS));
      router.push(safeCallback ?? homePathForRole(role));
      router.refresh();
    } catch {
      setFormError("We couldn't reach terpDESK. Check your connection and try again.");
    }
  };

  const toggleRecovery = () => {
    setUseRecovery((v) => !v);
    setValue("code", "");
    setFormError(null);
    setMood("mfa");
    setTimeout(() => setFocus("code"), 0);
  };

  /** Leave the code step: back to a clean email and password step (the email is kept, the password and code are cleared). */
  const backToCredentials = () => {
    setStep("credentials");
    setUseRecovery(false);
    setValue("code", "");
    setValue("password", "");
    setFormError(null);
    setMood("idle");
  };

  return { form, step, useRecovery, formError, justRegistered, verifySent, welcomed, submit: form.handleSubmit(onSubmit), toggleRecovery, backToCredentials };
}
