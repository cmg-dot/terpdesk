"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { homePathForRole, isAppRole } from "@/lib/auth/routes";
import { PasswordInput } from "@/components/ui/PasswordInput";

const loginSchema = z.object({
 email: z.string().email({ message: "Please enter a valid email address" }),
 password: z.string().min(1, { message: "Password is required" }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm() {
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
 const result = await signIn("credentials", { email: data.email, password: data.password, redirect: false });
 if (!result || result.error) {
 // Only the lockout notice is shown verbatim; every other failure is one generic message
 // so the form never reveals whether an email exists.
 setFormError(
 result?.error?.startsWith("Account temporarily locked")
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

 // Only follow same-site, role-appropriate callbacks.
 const callback = new URLSearchParams(window.location.search).get("callbackUrl");
 const safeCallback = callback && callback.startsWith("/") && !callback.startsWith("//") ? callback : null;
 router.push(safeCallback ?? homePathForRole(role));
 router.refresh();
 };

 return (
 <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
 {justRegistered && (
 <p role="status" className="rounded-xl bg-green-50 px-4 py-2.5 text-xs text-green-800">
 Account created successfully. Please log in.
 {verifySent && " We emailed you a link to verify your address and connect your existing interpreter profile. Until you verify, you will not see your agency's offers."}
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
 <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-xs text-red-700">
 {formError}
 </p>
 )}

 <div className="pt-2">
 <button
 type="submit"
 disabled={isSubmitting}
 className="rounded-full bg-[var(--forest)] px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[#0B3B32]/50 disabled:opacity-50"
 >
 {isSubmitting ? "Signing in..." : "Sign in"}
 </button>
 </div>
 </form>
 );
}
