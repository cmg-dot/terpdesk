"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  LayoutGrid,
  Calendar,
  Users,
  Building,
  Globe,
  Inbox,
  CreditCard,
  Settings,
  Bell,
  Menu,
  X,
} from "lucide-react";
import { RequestsProvider } from "@/context/RequestsContext";
import { ClientsProvider } from "@/context/ClientsContext";
import { NotificationBell } from "@/components/NotificationBell";
import { CountBadge } from "@/components/ui/CountBadge";
import { useInboxUnreadCount } from "@/hooks/useInboxUnreadCount";
import { AgencySidebar } from "@/components/agency/AgencySidebar";
import { MobileBrand } from "@/components/agency/SidebarBrand";
import { IdleTimeoutGuard } from "@/components/auth/IdleTimeoutGuard";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { NavLegalLinks } from "@/components/legal/LegalLinks";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const { data: session } = useSession();
  const userName = session?.user?.name ?? "";
  const userEmail = session?.user?.email ?? "";
  const unreadInbox = useInboxUnreadCount();

  return (
    <ClientsProvider>
      <RequestsProvider>
        {/* The page scrolls with the browser's own scrollbar (no inner scroll container); the sidebar stays put. */}
        <div className="flex min-h-screen bg-[var(--canvas)] font-sans text-slate-900">
          <IdleTimeoutGuard />
          <AgencySidebar userName={userName} userEmail={userEmail} />

          {/* Main Content Area */}
          <main className="flex min-w-0 flex-1 flex-col">
            {/* Header */}
            <header className="flex items-center justify-between px-4 md:px-8 py-5 sticky top-0 z-40 bg-[var(--canvas)]">
              <div className="text-sm text-slate-500">
                {userName} · Agency
              </div>
              <div className="flex items-center gap-4 md:gap-6">
                <NotificationBell />
                <SignOutButton className="text-sm text-slate-500 hover:text-slate-700" />
                <button onClick={() => setIsMenuOpen(true)} className="md:hidden text-slate-500 hover:text-slate-700 ml-1">
                  <Menu className="h-5 w-5" />
                </button>
              </div>
            </header>

            {/* Scrollable Page Content Container */}
            <div className="px-4 md:px-8 pb-24 md:pb-12">
              {children}
            </div>
          </main>

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
                  <div>
                    <MobileBrand />
                  </div>
                  <button 
                    onClick={() => setIsMenuOpen(false)}
                    className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                
                {/* Navigation Links */}
                <div className="flex flex-col gap-2 p-6 overflow-y-auto">
                  <Link href="/dashboard" onClick={() => setIsMenuOpen(false)} className={`flex items-center gap-4 rounded-full px-5 py-3.5 text-[15px] font-medium transition-colors ${pathname === '/dashboard' ? 'bg-[var(--surface)] text-[var(--forest)]' : 'text-slate-600 hover:bg-neutral-100 hover:text-slate-900'}`}>
                    <Home className="h-5 w-5" />
                    Dashboard
                  </Link>
                  <Link href="/requests" onClick={() => setIsMenuOpen(false)} className={`flex items-center gap-4 rounded-full px-5 py-3.5 text-[15px] font-medium transition-colors ${pathname.startsWith('/requests') ? 'bg-[var(--surface)] text-[var(--forest)]' : 'text-slate-600 hover:bg-neutral-100 hover:text-slate-900'}`}>
                    <LayoutGrid className="h-5 w-5" />
                    Requests & assignments
                  </Link>
                  <Link href="/calendar" onClick={() => setIsMenuOpen(false)} className={`flex items-center gap-4 rounded-full px-5 py-3.5 text-[15px] font-medium transition-colors ${pathname.startsWith('/calendar') ? 'bg-[var(--surface)] text-[var(--forest)]' : 'text-slate-600 hover:bg-neutral-100 hover:text-slate-900'}`}>
                    <Calendar className="h-5 w-5" />
                    Calendar
                  </Link>
                  <Link href="/interpreters" onClick={() => setIsMenuOpen(false)} className={`flex items-center gap-4 rounded-full px-5 py-3.5 text-[15px] font-medium transition-colors ${pathname.startsWith('/interpreters') ? 'bg-[var(--surface)] text-[var(--forest)]' : 'text-slate-600 hover:bg-neutral-100 hover:text-slate-900'}`}>
                    <Users className="h-5 w-5" />
                    Interpreters
                  </Link>
                  <Link href="/clients" onClick={() => setIsMenuOpen(false)} className={`flex items-center gap-4 rounded-full px-5 py-3.5 text-[15px] font-medium transition-colors ${pathname.startsWith('/clients') ? 'bg-[var(--surface)] text-[var(--forest)]' : 'text-slate-600 hover:bg-neutral-100 hover:text-slate-900'}`}>
                    <Building className="h-5 w-5" />
                    Organizations
                  </Link>
                  <Link href="/website-requests" onClick={() => setIsMenuOpen(false)} className={`flex items-center gap-4 rounded-full px-5 py-3.5 text-[15px] font-medium transition-colors ${pathname.startsWith('/website-requests') ? 'bg-[var(--surface)] text-[var(--forest)]' : 'text-slate-600 hover:bg-neutral-100 hover:text-slate-900'}`}>
                    <Globe className="h-5 w-5" />
                    Website requests
                  </Link>
                  <Link href="/inbox" onClick={() => setIsMenuOpen(false)} className={`flex items-center gap-4 rounded-full px-5 py-3.5 text-[15px] font-medium transition-colors ${pathname.startsWith('/inbox') ? 'bg-[var(--surface)] text-[var(--forest)]' : 'text-slate-600 hover:bg-neutral-100 hover:text-slate-900'}`}>
                    <Inbox className="h-5 w-5" />
                    Inbox
                    <CountBadge count={unreadInbox} label="unread emails" />
                  </Link>
                  <Link href="/billing" onClick={() => setIsMenuOpen(false)} className={`flex items-center justify-between rounded-full px-5 py-3.5 text-[15px] font-medium transition-colors ${pathname.startsWith('/billing') ? 'bg-[var(--surface)] text-[var(--forest)]' : 'text-slate-600 hover:bg-neutral-100 hover:text-slate-900'}`}>
                    <div className="flex items-center gap-4">
                      <CreditCard className="h-5 w-5" />
                      Billing
                    </div>
                    <span className="text-[11px] uppercase tracking-wider text-slate-400">Later</span>
                  </Link>
                  <Link href="/settings" onClick={() => setIsMenuOpen(false)} className={`flex items-center gap-4 rounded-full px-5 py-3.5 text-[15px] font-medium transition-colors ${pathname.startsWith('/settings') ? 'bg-[var(--surface)] text-[var(--forest)]' : 'text-slate-600 hover:bg-neutral-100 hover:text-slate-900'}`}>
                    <Settings className="h-5 w-5" />
                    Settings
                  </Link>
                </div>

                {/* Footer */}
                <div className="mt-auto p-6 border-t border-neutral-100">
                  <div className="flex flex-col gap-1 mb-6">
                    <span className="text-[15px] font-semibold text-[var(--ink)]">{userName}</span>
                    <span className="text-sm text-[var(--sage)]">{userEmail}</span>
                  </div>
                  <div className="flex flex-col gap-4">
                    <SignOutButton className="text-red-600 text-[15px] font-medium hover:text-red-700 text-left" />
                  </div>
                  <NavLegalLinks tone="light" className="mt-5" onNavigate={() => setIsMenuOpen(false)} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Mobile Bottom Navigation */}
          <nav className="fixed bottom-0 left-0 w-full bg-[var(--canvas)] border-t border-neutral-200 flex justify-between items-center px-2 py-2 md:hidden z-40 pb-[env(safe-area-inset-bottom,0.5rem)]">
            <Link href="/dashboard" className={`flex flex-col items-center justify-center rounded-2xl px-5 py-2 ${pathname === '/dashboard' ? 'bg-[var(--tint)] text-[var(--tint-ink)]' : 'text-slate-500'}`}>
              <Home className="h-5 w-5 mb-1" />
              <span className="text-[10px] font-medium">Home</span>
            </Link>
            <Link href="/requests" className={`flex flex-col items-center justify-center rounded-2xl px-4 py-2 ${pathname.startsWith('/requests') ? 'bg-[var(--tint)] text-[var(--tint-ink)]' : 'text-slate-500'}`}>
              <LayoutGrid className="h-5 w-5 mb-1" />
              <span className="text-[10px] font-medium">Requests</span>
            </Link>
            <Link href="/calendar" className={`flex flex-col items-center justify-center rounded-2xl px-4 py-2 ${pathname.startsWith('/calendar') ? 'bg-[var(--tint)] text-[var(--tint-ink)]' : 'text-slate-500'}`}>
              <Calendar className="h-5 w-5 mb-1" />
              <span className="text-[10px] font-medium">Calendar</span>
            </Link>
            <Link href="/interpreters" className={`flex flex-col items-center justify-center rounded-2xl px-4 py-2 ${pathname.startsWith('/interpreters') ? 'bg-[var(--tint)] text-[var(--tint-ink)]' : 'text-slate-500'}`}>
              <Users className="h-5 w-5 mb-1" />
              <span className="text-[10px] font-medium">Terps</span>
            </Link>
            <Link href="/billing" className={`flex flex-col items-center justify-center rounded-2xl px-4 py-2 ${pathname.startsWith('/billing') ? 'bg-[var(--tint)] text-[var(--tint-ink)]' : 'text-slate-500'}`}>
              <CreditCard className="h-5 w-5 mb-1" />
              <span className="text-[10px] font-medium">Billing</span>
            </Link>
          </nav>
        </div>
      </RequestsProvider>
    </ClientsProvider>
  );
}
