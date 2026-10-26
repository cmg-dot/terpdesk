import Link from "next/link";
import { Logo } from "@/components/logo";
import { RegisterForm } from "@/components/register-form";

export const metadata = { title: "Create an interpreter account | terpDESK" };

export default function RegisterPage() {
  return (
    <div className="min-h-[100dvh] w-full bg-[var(--canvas)] flex flex-col items-center justify-center p-4 font-sans text-[var(--ink)]">
      <div className="mb-4 flex flex-col items-center text-center">
        <Logo className="mb-2" />
        <p className="text-lg lg:text-xl text-slate-700">Create your interpreter account.</p>
      </div>

      <div className="w-full max-w-[90vw] lg:max-w-md rounded-2xl border border-neutral-100 bg-white p-6 lg:p-8">
        <p className="mb-6 text-xs lg:text-sm leading-relaxed text-[var(--sage)]">
          This creates an interpreter profile and login. It does not give you agency access.
        </p>

        <RegisterForm />

        <p className="mt-6 text-xs lg:text-sm text-[var(--sage)]">
          Already have an account?{" "}
          <Link
            href="/login/interpreter"
            className="text-[var(--sage)] underline decoration-slate-300 underline-offset-4 hover:text-slate-800"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
