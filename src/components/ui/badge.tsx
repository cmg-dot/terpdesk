import type { ReactNode } from "react";

export type BadgeVariant = "blue" | "purple" | "green" | "amber" | "gray";

const VARIANTS: Record<BadgeVariant, string> = {
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  gray: "bg-gray-100 text-gray-600 border-gray-200",
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

/** Small pill label, API-compatible with Shadcn's <Badge> for the variants this app uses. */
export const Badge = ({ variant = "gray", children, className = "" }: BadgeProps) => (
  <span
    className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${VARIANTS[variant]} ${className}`}
  >
    {children}
  </span>
);
