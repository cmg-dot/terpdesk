"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { BrandLockup } from "@/components/brand/BrandLockup";
import { INTERPRETER_BOTTOM_NAV, INTERPRETER_NAV, isNavActive } from "@/components/interpreter/interpreterNav";
import { InterpreterJobsProvider } from "@/context/InterpreterJobsContext";
import { NotificationBell } from "@/components/NotificationBell";
import { AlertToasts } from "@/components/ui/AlertToasts";
import { IdleTimeoutGuard } from "@/components/auth/IdleTimeoutGuard";
import { motion, AnimatePresence } from "framer-motion";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { NavLegalLinks } from "@/components/legal/LegalLinks";
import { useSession } from "next-auth/react";
import { InterpreterNameProvider, useInterpreterName } from "@/context/InterpreterNameContext";

export default function InterpreterLayout({ children }: { children: React.ReactNode }) {
  return (
    <InterpreterNameProvider>
      <InterpreterShell>{children}</InterpreterShell>
    </InterpreterNameProvider>
  );
}

function InterpreterShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const { data: session } = useSession();
  // Preferred name, else the account name.
  const { name: displayName } = useInterpreterName();
  const displayEmail = session?.user?.email ?? "";

  return (
    <div className="flex min-h-screen bg-[var(--canvas)] font-sans text-slate-900">
      {/* HIPAA automatic logoff: after 30 minutes without activity (a warning at 28) the interpreter is signed out, as agency staff are.
          This layout wraps every interpreter page, My work included. */}
      <IdleTimeoutGuard />
      {/* Sidebar (stays in view while the page scrolls with the browser's own scrollbar) */}
      <aside className="hidden md:flex sticky top-0 h-screen self-start w-64 flex-col bg-[var(--forest)] text-white shrink-0">
        <div className="flex flex-col p-5 pb-2">
          <BrandLockup tone="onDark" markClassName="h-8 w-8" className="mb-1" />
          <span className="text-[13px] text-[var(--sidebar-muted)] whitespace-nowrap tracking-tight">Your interpreting business. One place.</span>
          <span className="mt-5 text-[14px] font-medium text-white">Interpreter workspace</span>
        </div>

        <nav className="flex-1 overflow-y-auto space-y-0.5 px-4 py-1 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-[var(--forest)] [&::-webkit-scrollbar-thumb]:bg-[var(--forest-soft)] [&::-webkit-scrollbar-thumb]:rounded-full">
          {INTERPRETER_NAV.map((item) => (
            <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-xl px-4 py-[9px] text-[14px] font-medium transition-colors ${isNavActive(pathname, item) ? 'bg-white/10 text-white' : 'text-[var(--sidebar-muted)] hover:bg-white/5 hover:text-white'}`}>
              <item.Icon strokeWidth={1.5} className="h-[18px] w-[18px] shrink-0" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-5 pt-2">
          <div className="mb-4 flex flex-col">
            <span className="text-[14px] font-medium text-white">{displayName}</span>
            <span className="text-xs text-[var(--sidebar-muted)]">{displayEmail}</span>
          </div>
          <SignOutButton className="text-[13px] font-medium text-[var(--sidebar-muted)] hover:text-white transition-colors" />
          <NavLegalLinks tone="dark" className="mt-4" />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex min-w-0 flex-1 flex-col relative">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-[var(--canvas)]">
          <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-5 flex items-center justify-between w-full">
            <div className="text-[14px] text-gray-500 font-medium">
              {displayName} · Interpreter
            </div>
            <div className="flex items-center gap-6">
              <div className="relative mt-1">
                <NotificationBell />
              </div>
              <SignOutButton className="text-[14px] font-medium text-gray-700 hover:text-gray-900 transition-colors hidden md:block" />
              <button onClick={() => setIsMenuOpen(true)} className="md:hidden text-slate-500 hover:text-slate-900 transition-colors">
                <Menu className="w-6 h-6" />
              </button>
            </div>
          </div>
        </header>

        {/* Scrollable Page Content Container */}
        <div className="pb-24 md:pb-0">
          <InterpreterJobsProvider>
            {children}
          </InterpreterJobsProvider>
        </div>
      </main>
      {/* A floating pop-up for each new alert (a schedule change, an answer to a question), over the page. */}
      <AlertToasts />

      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.3 }}
            className="fixed inset-0 z-[100] h-full w-full bg-[var(--canvas)] flex flex-col"
          >
            {/* Header (Logo & Close) */}
            <div className="flex justify-between items-center p-6 border-b border-neutral-100 shrink-0">
              <BrandLockup tone="onLight" markClassName="h-8 w-8" />
              <button
                onClick={() => setIsMenuOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Navigation Links */}
            <div className="flex flex-col gap-2 p-6 overflow-y-auto">
              {INTERPRETER_NAV.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setIsMenuOpen(false)} className={`flex items-center gap-4 rounded-full px-5 py-3.5 text-[15px] font-medium transition-colors ${isNavActive(pathname, item) ? 'bg-[var(--surface)] text-[var(--forest)]' : 'text-slate-600 hover:bg-neutral-100 hover:text-slate-900'}`}>
                  <item.Icon strokeWidth={1.5} className="h-5 w-5" />
                  {item.label}
                </Link>
              ))}
            </div>

            {/* Footer */}
            <div className="mt-auto p-6 border-t border-neutral-100">
              <div className="flex flex-col gap-1 mb-6">
                <span className="text-[15px] font-semibold text-[var(--ink)]">{displayName}</span>
                <span className="text-sm text-[var(--sage)]">{displayEmail}</span>
              </div>
              <div className="flex flex-col gap-4">
                <Link href="/dashboard" onClick={() => setIsMenuOpen(false)} className="text-slate-600 text-[15px] font-medium hover:text-[var(--forest)]">Switch to Agency</Link>
                <SignOutButton className="text-red-600 text-[15px] font-medium hover:text-red-700 text-left" />
              </div>
              <NavLegalLinks tone="light" className="mt-5" onNavigate={() => setIsMenuOpen(false)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 w-full bg-[var(--canvas)] border-t border-neutral-200 flex justify-between items-center px-2 py-2 md:hidden z-40 pb-[env(safe-area-inset-bottom,0.5rem)]">
        {INTERPRETER_BOTTOM_NAV.map((item) => (
          <Link key={item.href} href={item.href} className={`flex flex-col items-center justify-center rounded-2xl py-2 ${item.exact ? 'px-5' : 'px-4'} ${isNavActive(pathname, item) ? 'bg-[var(--tint)] text-[var(--tint-ink)]' : 'text-slate-500'}`}>
            <item.Icon className="h-5 w-5 mb-1" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
