"use client";

import { useState } from "react";
import { approveHours, requestHoursCorrection } from "@/app/actions/reviewHours";
import { approveTimesheet } from "@/app/actions/approveTimesheet";
import { needsMileageReason } from "@/components/features/MileageApprovalField";
import type { ServiceRecord } from "@/utils/hoursReviewRecords";

/**
 * The agency's review of one hours record: the mileage to approve (and why it differs), a signature exception, the correction
 * message, and the two actions. `onUpdate` receives the record in its new state once an action is done.
 */
export function useReviewActions(record: ServiceRecord, onUpdate: (r: ServiceRecord) => void) {
  const [hasException, setHasException] = useState(false);
  const [showSignatureError, setShowSignatureError] = useState(false);

  // Correction / Approval State
  const [correctionText, setCorrectionText] = useState("");
  const [showCorrectionError, setShowCorrectionError] = useState(false);

  const [mileageToApprove, setMileageToApprove] = useState(record.reportedMileage.toString());
  const [showMileageError, setShowMileageError] = useState(false);
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [showReasonError, setShowReasonError] = useState(false);

  // React 18: an async startTransition does not stay pending across the await, so track it explicitly.
  const [isApproving, setIsApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const handleApprove = async () => {
    if (isApproving) return;
    if (!hasException && !record.signatureDataUrl) {
      setShowSignatureError(true);
      return;
    }
    const mileageNum = parseFloat(mileageToApprove);
    if (isNaN(mileageNum) || mileageNum < 0) {
      setShowMileageError(true);
      return;
    }
    // A different mileage than reported needs a reason (the server enforces this too).
    const reason = needsMileageReason(record.reportedMileage ?? 0, mileageToApprove) ? adjustmentReason.trim() : "";
    if (needsMileageReason(record.reportedMileage ?? 0, mileageToApprove) && !reason) {
      setShowReasonError(true);
      return;
    }
    setShowSignatureError(false);
    setShowMileageError(false);
    setShowReasonError(false);
    setApproveError(null);
    setIsApproving(true);

    try {
      const result = record.timesheetId
        ? await approveTimesheet({ timesheetId: record.timesheetId, approvedMileage: mileageNum, mileageAdjustmentReason: reason })
        : await approveHours(record.appointmentId, mileageNum, record.positionIndex || 1, reason);
      if (!result.success) {
        setApproveError(result.error);
        setIsApproving(false);
        return;
      }
    } catch (e) {
      console.error("[hours-review page] operation failed");
    }
    setIsApproving(false);

    const prevHistory = Array.isArray(record.history) ? record.history : [];
    const approveEntry = {
      id: Math.random().toString(36).substring(7),
      type: "approved",
      title: record.positionIndex ? `Hours approved and finalized (Position ${record.positionIndex})` : "Hours approved and finalized",
      actor: "Agency Staff",
      timestamp: new Date().toISOString(),
      version: record.version || 1,
      details: {
        approvedMileage: mileageNum,
      },
    };

    onUpdate({
      ...record,
      state: "approved",
      approvedMileage: mileageNum,
      mileageAdjustmentReason: reason || null,
      reviewMessage: null,
      history: [...prevHistory, approveEntry],
    });
  };

  const handleRequestCorrection = async () => {
    if (!correctionText.trim()) {
      setShowCorrectionError(true);
      return;
    }
    setShowCorrectionError(false);

    try {
      await requestHoursCorrection(record.appointmentId, correctionText, record.positionIndex || 1);
    } catch (e) {
      console.error("[hours-review page] operation failed");
    }

    const prevHistory = Array.isArray(record.history) ? record.history : [];
    const corrEntry = {
      id: Math.random().toString(36).substring(7),
      type: "correction_requested",
      title: record.positionIndex ? `Correction requested by agency (Position ${record.positionIndex})` : "Correction requested by agency",
      actor: "Agency Staff",
      timestamp: new Date().toISOString(),
      version: record.version || 1,
      message: correctionText,
    };

    onUpdate({
      ...record,
      state: "correction_requested",
      reviewMessage: correctionText,
      history: [...prevHistory, corrEntry],
    });
  };

  return {
    hasException,
    setHasException,
    showSignatureError,
    setShowSignatureError,
    correctionText,
    setCorrectionText,
    showCorrectionError,
    setShowCorrectionError,
    mileageToApprove,
    setMileageToApprove,
    showMileageError,
    adjustmentReason,
    setAdjustmentReason,
    showReasonError,
    setShowReasonError,
    isApproving,
    approveError,
    handleApprove,
    handleRequestCorrection,
  };
}

export type ReviewActionsState = ReturnType<typeof useReviewActions>;
