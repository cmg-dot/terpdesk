"use client";

import React from "react";

interface HappeningNowBadgeProps {
  className?: string;
  size?: "sm" | "md";
}

export function HappeningNowBadge({ className = "", size = "md" }: HappeningNowBadgeProps) {
  const isSm = size === "sm";

  return (
    <span
      className={`inline-flex items-center gap-1.5 bg-emerald-600 text-white font-semibold rounded-full shadow-sm shrink-0 ${
        isSm ? "text-[11px] px-2.5 py-0.5" : "text-[12px] px-3 py-1"
      } ${className}`}
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
      </span>
      <span>Happening now</span>
    </span>
  );
}
