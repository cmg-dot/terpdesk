"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Link from "next/link";
import { getSession, signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { homePathForRole, isAppRole, loginPathForRole, requiredRoleForPath } from "@/lib/auth/routes";
import type { AppRole } from "@/lib/auth/routes";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { AgreementNotice } from "@/components/legal/LegalLinks";
import { DISPLAYABLE_AUTH_MESSAGES, WRONG_PORTAL_MESSAGES } from "@/lib/auth/messages";

const loginSchema = z.object({
 email: z.string().email({ message: "Please enter a valid email address" }),
 password: z.string().min(1, { message: "Password is required" }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

/** The sign-in form of one portal. The server refuses accounts of the other role (see authorize() in auth options). */
export function LoginForm({ portal }: { portal: AppRole }) {
 const otherPortal: AppRole = portal === "agency" ? "interpreter" : "agency";
 const router = useRouter();
 const [justRegistered, setJustRegistered] = React.useState(false);
 const [verifySent, setVerifySent] = React.useState(false);
 // Read after mount so the server and first client render match.
 React.useEffect(() => {
 const params = new URLSearchParams(window.location.search);
 setJustRegistered(params.get("registered") === "true");
 setVerifySent(params.get("verify") === "sent");
 }, []);
 const [formError, setFormError] = React.useState<string | null>(() => {
 if (typeof window === "undefined") return null;
 return new URLSearchParams(window.location.search).get("error") === "forbidden"
 ? "Your account does not have access to that area. Sign in with a different account."
 : null;
 });
 const {
 register,
 handleSubmit,
 formState: { errors, isSubmitting },
 } = useForm<LoginFormValues>({
 resolver: zodResolver(loginSchema),
 defaultValues: {
 email: "",
 password: "",
 },
 });

 const onSubmit = async (data: LoginFormValues) => {
 setFormError(null);
 const result = await signIn("credentials", { email: data.email, password: data.password, portal, redirect: false });
 if (!result || result.error) {
 // Only the lockout notice is shown verbatim; every other failure is one generic message
 // so the form never reveals whether an email exists.
 setFormError(
 result?.error && DISPLAYABLE_AUTH_MESSAGES.includes(result.error)
 ? result.error
 : "Incorrect email or password.",
 );
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
 await signOut({ redirect: false });
 setFormError(WRONG_PORTAL_MESSAGES[portal]);
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
 router.push(safeCallback ?? homePathForRole(role));
 router.refresh();
 };

 return (
 <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
 {justRegistered && (
 <p role="status" className="rounded-xl bg-green-50 px-4 py-2.5 text-xs text-green-800">
 Account created successfully. Please log in.
 {verifySent && " We emailed you a link to verify your address and connect your existing interpreter profile. Until you verify, you will not see your agencies' offers."}
 </p>
 )}
 <div className="space-y-1">
 <label
 htmlFor="email"
 className="block text-xs lg:text-sm text-[var(--sage)]"
 >
 Email
 </label>
 <input
 id="email"
 type="email"
 autoComplete="email"
 disabled={isSubmitting}
 {...register("email")}
 className="w-full rounded-full bg-neutral-100 px-4 py-2.5 text-sm outline-none transition-colors focus:bg-neutral-200 focus:ring-2 focus:ring-[#0B3B32]/20"
 />
 {errors.email && (
 <p className="text-xs text-red-500">{errors.email.message}</p>
 )}
 </div>

 <div className="space-y-1">
 <label
 htmlFor="password"
 className="block text-xs lg:text-sm text-[var(--sage)]"
 >
 Password
 </label>
 <PasswordInput
 id="password"
 autoComplete="current-password"
 disabled={isSubmitting}
 {...register("password")}
 className="w-full rounded-full bg-neutral-100 px-4 py-2.5 text-sm outline-none transition-colors focus:bg-neutral-200 focus:ring-2 focus:ring-[#0B3B32]/20"
 />
 {errors.password && (
 <p className="text-xs text-red-500">{errors.password.message}</p>
 )}
 </div>

 {formError && (
 <div role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-xs text-red-700">
 <p>{formError}</p>
 {formError === WRONG_PORTAL_MESSAGES[portal] && (
 <Link href={loginPathForRole(otherPortal)} className="mt-1.5 inline-block font-semibold underline underline-offset-2">
 Go to the {otherPortal} sign-in
 </Link>
 )}
 </div>
 )}

 <div className="pt-2">
 <button
 type="submit"
 disabled={isSubmitting}
 className="rounded-full bg-[var(--forest)] px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[#0B3B32]/50 disabled:opacity-50"
 >
 {isSubmitting ? "Signing in..." : "Sign in"}
 </button>
 <AgreementNotice className="mt-3" />
 </div>
 </form>
 );
}
