"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Mail, Phone, Send, ShieldCheck, UserPlus } from "lucide-react";
import { AnimatedPaginatedList } from "@/components/ui/AnimatedPaginatedList";
import type { ManageAccessTarget } from "@/components/interpreters/ManageAccessModal";
import type { SelectInterpreter } from "@/db/schema";

/** A roster row; `rosterActive` is false for archived interpreters (missing = active, e.g. just added). */
export type RosterItem = SelectInterpreter & { rosterActive?: boolean };

interface RosterTabProps {
  /** Rows to show (already filtered by the page's search box). */
  items: RosterItem[];
  searchQuery: string;
  registeredProfileIds: string[];
  onManage: (target: ManageAccessTarget) => void;
  onAddExternal: () => void;
}

// Known emails that have registered dev/app user accounts
const KNOWN_REGISTERED_EMAILS = new Set([
  "dale.fictional@example.com",
  "new.terp@example.com",
  "terp.declined@fictional.test",
]);

function getInterpreterInitials(name: string): string {
  if (!name) return "IN";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getAvatarBgColor(name: string, isRegistered: boolean): string {
  if (isRegistered) return "bg-[#0B3B32]"; // Rich forest green for registered users
  // Deterministic palette for external shadow interpreters
  const colors = [
    "bg-[#5B3E96]", // Royal purple
    "bg-[#1E40AF]", // Deep blue
    "bg-[#0E7490]", // Cyan slate
    "bg-[#9A3412]", // Warm terracotta
    "bg-[#374151]", // Charcoal slate
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/** Interpreters page "Roster" tab: approved connections, with the Manage access action per row. */
export const RosterTab = ({ items, searchQuery, registeredProfileIds, onManage, onAddExternal }: RosterTabProps) => {
  const registeredIdSet = useMemo(() => new Set(registeredProfileIds), [registeredProfileIds]);

  const checkIsRegistered = (interpreter: SelectInterpreter): boolean => {
    // A linked login (set when an interpreter registers or claims a shadow profile) is the source of truth.
    if (interpreter.userId) return true;
    const email = interpreter.email.toLowerCase();
    if (KNOWN_REGISTERED_EMAILS.has(email)) return true;
    if (registeredIdSet.has(interpreter.id)) return true;
    if (registeredIdSet.has(interpreter.email)) return true;
    return false;
  };

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center space-y-3">
        <p className="text-gray-600 text-sm">
          {searchQuery ? `No interpreters matching "${searchQuery}".` : "No interpreters found in the database."}
        </p>
        <button
          type="button"
          onClick={onAddExternal}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#0B3B32] text-white text-xs font-medium hover:bg-[#082a23] transition-colors"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Add First External Interpreter</span>
        </button>
      </div>
    );
  }

  return (
    <AnimatedPaginatedList
      as="ul"
      items={items}
      itemsPerPage={10}
      className="space-y-4"
      getKey={(interpreter) => interpreter.id}
      renderItem={(interpreter) => {
        const isRegistered = checkIsRegistered(interpreter);
        const initials = getInterpreterInitials(interpreter.name);
        const avatarBg = getAvatarBgColor(interpreter.name, isRegistered);

        return (
          <motion.li
            layout
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            key={interpreter.id}
            className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4 hover:shadow-sm transition-all list-none"
          >
            <div className="flex items-start gap-4">
              {/* Avatar Circle (also opens the interpreter's detail page; hidden from screen readers to avoid a duplicate link) */}
              <Link
                href={`/interpreters/${interpreter.id}`}
                tabIndex={-1}
                aria-hidden="true"
                className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-base shrink-0 shadow-sm ${avatarBg}`}
              >
                {initials}
              </Link>

              {/* Profile Details */}
              <div className="flex flex-col space-y-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h3 className="text-[17px] font-semibold text-[var(--ink)]">
                    <Link href={`/interpreters/${interpreter.id}`} className="hover:underline focus:underline focus:outline-none">
                      {interpreter.name}
                    </Link>
                  </h3>

                  {/* UI Badging: Registered App User vs Shadow / External */}
                  {isRegistered ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-semibold bg-[#E5F0EB] text-[#0A3D31] border border-[#BCE1D1]">
                      <ShieldCheck className="w-3 h-3 text-[#0A3D31]" />
                      <span>Registered App User</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-semibold bg-[#F3F0FA] text-[#553C9A] border border-[#DDD6FE]">
                      <Send className="w-3 h-3 text-[#6D28D9]" />
                      <span>Shadow / External</span>
                    </span>
                  )}

                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#F4F3EF] text-gray-600 border border-gray-200/60">
                    {interpreter.rosterActive === false ? "Archived" : "Active on Roster"}
                  </span>
                </div>

                {/* Email and Phone */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-[var(--sage)] pt-0.5">
                  <span className="inline-flex items-center gap-1.5 text-gray-600 font-medium">
                    <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    {interpreter.email}
                  </span>

                  {interpreter.phone && (
                    <span className="inline-flex items-center gap-1.5 text-gray-500">
                      <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      {interpreter.phone}
                    </span>
                  )}
                </div>

                {/* Contextual dispatch note */}
                <p className="text-[11.5px] text-gray-400 pt-1">
                  {isRegistered
                    ? "Full terpDESK portal access · Receives calendar invites and in-app offers"
                    : "External profile · Receives AWS SES email dispatch with one-click token response"}
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3 sm:pt-1 self-start sm:self-auto">
              <button
                type="button"
                onClick={() =>
                  onManage({
                    id: interpreter.id,
                    name: interpreter.name,
                    email: interpreter.email,
                    isRegistered,
                    isActive: interpreter.rosterActive !== false,
                  })
                }
                className="text-xs px-3.5 py-1.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium transition-colors cursor-pointer"
              >
                Manage access
              </button>
            </div>
          </motion.li>
        );
      }}
    />
  );
};
