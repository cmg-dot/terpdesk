"use client";

import React from "react";
import { CheckCircle2, Clock, Ban, HelpCircle, AlertTriangle, AlertCircle } from "lucide-react";
import type { InterpreterFitStatus } from "@/app/actions/availability";

export interface InterpreterFitBadgeProps {
  fit?: InterpreterFitStatus | string | null;
  className?: string;
  showIcon?: boolean;
}

/**
 * Privacy-safe fit badge adhering to terpdesk availability spec:
 * - Available (green badge)
 * - Unavailable (gray/amber badge - merged for busy/conflict)
 * - Outside usual hours (amber badge)
 * - Availability not provided / Not shared (muted badge)
 */
export function InterpreterFitBadge({
  fit,
  className = "",
  showIcon = true,
}: InterpreterFitBadgeProps) {
  if (!fit) return null;

  switch (fit) {
    case "available":
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#EBF7EE] text-[#1E7E34] border border-[#C3E6CB] ${className}`}
          title="Interpreter is available during this appointment time"
        >
          {showIcon && <CheckCircle2 className="w-3 h-3 text-[#1E7E34]" />}
          <span>Available</span>
        </span>
      );

    case "unavailable":
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#FFF3CD] text-[#856404] border border-[#FFEEBA] ${className}`}
          title="Interpreter has an existing commitment during this time"
        >
          {showIcon && <Ban className="w-3 h-3 text-[#856404]" />}
          <span>Unavailable</span>
        </span>
      );

    case "outside_hours":
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] ${className}`}
          title="Appointment is outside interpreter's usual hours"
        >
          {showIcon && <Clock className="w-3 h-3 text-[#92400E]" />}
          <span>Outside usual hours</span>
        </span>
      );

    case "not_shared":
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F1F3F5] text-[#6C757D] border border-[#DEE2E6] ${className}`}
          title="Interpreter is not sharing availability with this agency"
        >
          {showIcon && <HelpCircle className="w-3 h-3 text-[#6C757D]" />}
          <span>Not shared</span>
        </span>
      );

    case "not_provided":
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F1F3F5] text-[#6C757D] border border-[#DEE2E6] ${className}`}
          title="Interpreter has not provided hours for this day"
        >
          {showIcon && <HelpCircle className="w-3 h-3 text-[#6C757D]" />}
          <span>Availability not provided</span>
        </span>
      );
  }
}

/**
 * Soft warning notice displayed when dispatcher picks an interpreter with warning status.
 * Dispatcher can still send offers, but gets complete visibility.
 */
export function FitWarningNotice({ fit }: { fit?: InterpreterFitStatus | string | null }) {
  if (!fit || fit === "available") return null;

  if (fit === "unavailable") {
    return (
      <div className="flex items-start gap-2.5 p-3.5 bg-amber-50/90 border border-amber-200/90 rounded-xl text-amber-900 text-xs mt-3">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="font-semibold text-amber-950">Notice · Unavailable:</strong> This interpreter has an existing commitment during this scheduled time. You can still send an offer, but they will not be able to accept it unless their conflicting schedule is cleared.
        </div>
      </div>
    );
  }

  if (fit === "outside_hours") {
    return (
      <div className="flex items-start gap-2.5 p-3.5 bg-amber-50/70 border border-amber-200/70 rounded-xl text-amber-900 text-xs mt-3">
        <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="font-semibold text-amber-950">Notice · Outside usual hours:</strong> This appointment falls outside this interpreter&apos;s regular working hours. You can still send an offer.
        </div>
      </div>
    );
  }

  if (fit === "not_shared") {
    return (
      <div className="flex items-start gap-2.5 p-3.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-700 text-xs mt-3">
        <AlertCircle className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="font-semibold text-gray-900">Notice · Not shared:</strong> This interpreter is not currently sharing their availability calendar with your agency. You can still send an offer.
        </div>
      </div>
    );
  }

  if (fit === "not_provided") {
    return (
      <div className="flex items-start gap-2.5 p-3.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-700 text-xs mt-3">
        <AlertCircle className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="font-semibold text-gray-900">Notice · Availability not provided:</strong> This interpreter has not provided working hours for this weekday. You can still send an offer.
        </div>
      </div>
    );
  }

  return null;
}
