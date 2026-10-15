"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UserPlus, X, Mail, Phone, User, AlertCircle, Info, Loader2 } from "lucide-react";
import { addExternalInterpreter } from "@/app/actions/addExternalInterpreter";
import type { SelectInterpreter } from "@/db/schema";

interface AddExternalInterpreterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (interpreter: SelectInterpreter) => void;
}

export function AddExternalInterpreterModal({
  isOpen,
  onClose,
  onSuccess,
}: AddExternalInterpreterModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setName("");
    setEmail("");
    setPhone("");
    setErrorMessage(null);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    if (isSubmitting) return;
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName) {
      setErrorMessage("Please enter the interpreter's full name.");
      return;
    }

    if (!trimmedEmail) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setErrorMessage("Please enter a valid email format (e.g., name@example.com).");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await addExternalInterpreter({
        name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone || undefined,
      });

      if (!response.success || !response.interpreter) {
        setErrorMessage(response.error || "Failed to add external interpreter.");
        setIsSubmitting(false);
        return;
      }

      const createdInterpreter = response.interpreter;
      resetForm();
      onSuccess(createdInterpreter);
      onClose();
    } catch (err: any) {
      console.error("Error submitting external interpreter:", err);
      setErrorMessage(err?.message || "An unexpected error occurred. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="relative z-10 w-full max-w-lg rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-gray-100"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-5">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-[#E5F0EB] text-[#0B3B32] flex items-center justify-center shrink-0">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-[var(--ink)]">
                    Add External Interpreter
                  </h2>
                  <p className="text-xs text-[var(--sage)] mt-0.5">
                    Create a shadow profile for AWS SES email dispatch
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors disabled:opacity-50"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Informational Callout */}
            <div className="mt-5 rounded-2xl bg-[#F8FAF9] border border-[#E2ECE7] p-4 text-xs text-slate-600 leading-relaxed flex items-start gap-3">
              <Info className="w-4 h-4 text-[#0B3B32] shrink-0 mt-0.5" />
              <span>
                <strong>Shadow Profile:</strong> External interpreters do not need NextAuth portal credentials. They can accept or decline job offers directly from their email inbox via secure magic links.
              </span>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              {errorMessage && (
                <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-700 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span className="font-medium">{errorMessage}</span>
                </div>
              )}

              {/* Full Name */}
              <div className="space-y-1.5">
                <label
                  htmlFor="interpreter-name"
                  className="block text-xs font-semibold text-[var(--ink)]"
                >
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    id="interpreter-name"
                    type="text"
                    required
                    disabled={isSubmitting}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Alex Morgan"
                    className="w-full bg-[#F4F3EF] border border-transparent rounded-full pl-10 pr-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:bg-white focus:border-[#0B3B32] focus:ring-2 focus:ring-[#0B3B32]/20 outline-none transition-all disabled:opacity-60"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label
                  htmlFor="interpreter-email"
                  className="block text-xs font-semibold text-[var(--ink)]"
                >
                  Email Address <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <Mail className="w-4 h-4" />
                  </span>
                  <input
                    id="interpreter-email"
                    type="email"
                    required
                    disabled={isSubmitting}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g., alex.morgan@example.com"
                    className="w-full bg-[#F4F3EF] border border-transparent rounded-full pl-10 pr-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:bg-white focus:border-[#0B3B32] focus:ring-2 focus:ring-[#0B3B32]/20 outline-none transition-all disabled:opacity-60"
                  />
                </div>
                <p className="text-[11px] text-[var(--sage)] pl-2">
                  Job offer emails with one-click response links will be delivered here.
                </p>
              </div>

              {/* Phone (Optional) */}
              <div className="space-y-1.5">
                <label
                  htmlFor="interpreter-phone"
                  className="block text-xs font-semibold text-[var(--ink)]"
                >
                  Phone Number <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <Phone className="w-4 h-4" />
                  </span>
                  <input
                    id="interpreter-phone"
                    type="tel"
                    disabled={isSubmitting}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g., (206) 555-0142"
                    className="w-full bg-[#F4F3EF] border border-transparent rounded-full pl-10 pr-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:bg-white focus:border-[#0B3B32] focus:ring-2 focus:ring-[#0B3B32]/20 outline-none transition-all disabled:opacity-60"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-full border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#0B3B32] text-sm font-medium text-white hover:bg-[#082a23] transition-colors shadow-sm disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Adding Interpreter...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>Add to Roster</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
