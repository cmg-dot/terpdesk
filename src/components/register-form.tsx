"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { registerInterpreter } from "@/app/actions/registerInterpreter";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { PasswordRequirements } from "@/components/ui/PasswordRequirements";
import { registerInterpreterSchema } from "@/lib/validation/registerInterpreter";
import type { RegisterInterpreterInput } from "@/lib/validation/registerInterpreter";

const inputClass =
  "w-full rounded-full bg-neutral-100 px-4 py-2.5 text-sm outline-none transition-colors focus:bg-neutral-200 focus:ring-2 focus:ring-[#0B3B32]/20";
const labelClass = "block text-xs lg:text-sm text-[var(--sage)]";

const FIELDS = [
  { name: "name", label: "Full name", type: "text", autoComplete: "name" },
  { name: "email", label: "Email", type: "email", autoComplete: "email" },
  { name: "phone", label: "Phone number", type: "tel", autoComplete: "tel" },
  { name: "password", label: "Password", type: "password", autoComplete: "new-password" },
] as const;

export function RegisterForm() {
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInterpreterInput>({
    resolver: zodResolver(registerInterpreterSchema),
    defaultValues: { name: "", email: "", phone: "", password: "" },
  });

  const password = watch("password");

  const onSubmit = async (data: RegisterInterpreterInput) => {
    setFormError(null);
    try {
      const result = await registerInterpreter(data);
      if (!result.success) {
        setFormError(result.error);
        return;
      }
      router.push(result.verificationRequired ? "/login?registered=true&verify=sent" : "/login?registered=true");
    } catch {
      setFormError("Something went wrong. Please try again.");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {FIELDS.map((field) => (
        <div key={field.name} className="space-y-1">
          <label htmlFor={field.name} className={labelClass}>
            {field.label}
          </label>
          {field.name === "password" ? (
            <PasswordInput
              id={field.name}
              autoComplete={field.autoComplete}
              disabled={isSubmitting}
              {...register(field.name)}
              className={inputClass}
            />
          ) : (
            <input
              id={field.name}
              type={field.type}
              autoComplete={field.autoComplete}
              disabled={isSubmitting}
              {...register(field.name)}
              className={inputClass}
            />
          )}
          {field.name === "password" && <PasswordRequirements password={password ?? ""} />}
          {errors[field.name] && <p className="text-xs text-red-500">{errors[field.name]?.message}</p>}
        </div>
      ))}

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
          {isSubmitting ? "Creating account..." : "Create account"}
        </button>
      </div>
    </form>
  );
}
