"use client";

import React from "react";
import Image from "next/image";
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
import { DEFAULT_AGENCY_NAME } from "@/lib/agency";
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
        <div className="flex min-h-screen bg-[#F9F8F4] font-sans text-slate-900">
          {/* Sidebar */}
          <aside className="hidden md:flex sticky top-0 h-screen self-start overflow-y-auto sidebar-scroll w-64 flex-col bg-[#0B3B32] text-white shrink-0">
            <div className="flex flex-col p-6">
              <div className="flex items-center gap-3 mb-1">
                <Image
                  src="/terpdesk-mark.png"
                  alt="terpDESK Logo"
                  width={32}
                  height={32}
                  className="w-8 h-8 rounded-full object-contain"
                  priority
                />
                <span className="text-white font-semibold text-[22px]">terpDESK</span>
              </div>
              <span className="text-[13px] text-[#8BA49E]">{DEFAULT_AGENCY_NAME}</span>
              <span className="mt-6 text-[15px] font-medium text-white">Agency workspace</span>
            </div>

            <nav className="flex-1 space-y-1.5 px-4 py-2">
              <Link href="/dashboard" className={`flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${pathname === '/dashboard' ? 'bg-white/10 text-white' : 'text-[#8BA49E] hover:bg-white/5 hover:text-white'}`}>
                <Home className="h-4 w-4" />
                Dashboard
              </Link>
              <Link href="/requests" className={`flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${pathname.startsWith('/requests') ? 'bg-white/10 text-white' : 'text-[#8BA49E] hover:bg-white/5 hover:text-white'}`}>
                <LayoutGrid className="h-4 w-4" />
                Requests & assignments
              </Link>
              <Link href="/calendar" className={`flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${pathname.startsWith('/calendar') ? 'bg-white/10 text-white' : 'text-[#8BA49E] hover:bg-white/5 hover:text-white'}`}>
                <Calendar className="h-4 w-4" />
                Calendar
              </Link>
              <Link href="/interpreters" className={`flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${pathname.startsWith('/interpreters') ? 'bg-white/10 text-white' : 'text-[#8BA49E] hover:bg-white/5 hover:text-white'}`}>
                <Users className="h-4 w-4" />
                Interpreters
              </Link>
              <Link href="/clients" className={`flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${pathname.startsWith('/clients') ? 'bg-white/10 text-white' : 'text-[#8BA49E] hover:bg-white/5 hover:text-white'}`}>
                <Building className="h-4 w-4" />
                Clients
              </Link>
              <Link href="/website-requests" className={`flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${pathname.startsWith('/website-requests') ? 'bg-white/10 text-white' : 'text-[#8BA49E] hover:bg-white/5 hover:text-white'}`}>
                <Globe className="h-4 w-4" />
                Website requests
              </Link>
              <Link href="/inbox" className={`flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${pathname.startsWith('/inbox') ? 'bg-white/10 text-white' : 'text-[#8BA49E] hover:bg-white/5 hover:text-white'}`}>
                <Inbox className="h-4 w-4" />
                Inbox
                <CountBadge count={unreadInbox} label="unread emails" />
              </Link>
              <Link href="/billing" className={`flex items-center justify-between rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${pathname.startsWith('/billing') ? 'bg-white/10 text-white' : 'text-[#8BA49E] hover:bg-white/5 hover:text-white'}`}>
                <div className="flex items-center gap-3">
                  <CreditCard className="h-4 w-4" />
                  Billing
                </div>
                <span className="text-[10px] text-[#8BA49E]">Later</span>
              </Link>
              <Link href="/settings" className={`flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${pathname.startsWith('/settings') ? 'bg-white/10 text-white' : 'text-[#8BA49E] hover:bg-white/5 hover:text-white'}`}>
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </nav>

            <div className="p-6">
              <div className="mb-4 flex flex-col">
                <span className="text-sm font-medium text-white">{userName}</span>
                <span className="text-xs text-[#8BA49E]">{userEmail}</span>
              </div>
              <SignOutButton className="text-sm font-medium text-white hover:underline underline-offset-4 decoration-white/30" />
              <NavLegalLinks tone="dark" className="mt-5" />
            </div>
          </aside>

          {/* Main Content Area */}
          <main className="flex min-w-0 flex-1 flex-col">
            {/* Header */}
            <header className="flex items-center justify-between px-4 md:px-8 py-5 sticky top-0 z-40 bg-[#F9F8F4]">
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
                  <div className="flex items-center gap-3">
                    <Image
                      src="/terpdesk-mark.png"
                      alt="terpDESK Logo"
                      width={32}
                      height={32}
                      className="w-8 h-8 rounded-lg object-contain"
                      priority
                    />
                    <span className="text-[var(--forest)] font-semibold text-[22px]">terpDESK</span>
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
                    Clients
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
          <nav className="fixed bottom-0 left-0 w-full bg-[#F9F8F4] border-t border-neutral-200 flex justify-between items-center px-2 py-2 md:hidden z-40 pb-[env(safe-area-inset-bottom,0.5rem)]">
            <Link href="/dashboard" className={`flex flex-col items-center justify-center rounded-2xl px-5 py-2 ${pathname === '/dashboard' ? 'bg-[#E6EFEA] text-[#385B52]' : 'text-slate-500'}`}>
              <Home className="h-5 w-5 mb-1" />
              <span className="text-[10px] font-medium">Home</span>
            </Link>
            <Link href="/requests" className={`flex flex-col items-center justify-center rounded-2xl px-4 py-2 ${pathname.startsWith('/requests') ? 'bg-[#E6EFEA] text-[#385B52]' : 'text-slate-500'}`}>
              <LayoutGrid className="h-5 w-5 mb-1" />
              <span className="text-[10px] font-medium">Requests</span>
            </Link>
            <Link href="/calendar" className={`flex flex-col items-center justify-center rounded-2xl px-4 py-2 ${pathname.startsWith('/calendar') ? 'bg-[#E6EFEA] text-[#385B52]' : 'text-slate-500'}`}>
              <Calendar className="h-5 w-5 mb-1" />
              <span className="text-[10px] font-medium">Calendar</span>
            </Link>
            <Link href="/interpreters" className={`flex flex-col items-center justify-center rounded-2xl px-4 py-2 ${pathname.startsWith('/interpreters') ? 'bg-[#E6EFEA] text-[#385B52]' : 'text-slate-500'}`}>
              <Users className="h-5 w-5 mb-1" />
              <span className="text-[10px] font-medium">Terps</span>
            </Link>
            <Link href="/billing" className={`flex flex-col items-center justify-center rounded-2xl px-4 py-2 ${pathname.startsWith('/billing') ? 'bg-[#E6EFEA] text-[#385B52]' : 'text-slate-500'}`}>
              <CreditCard className="h-5 w-5 mb-1" />
              <span className="text-[10px] font-medium">Billing</span>
            </Link>
          </nav>
        </div>
      </RequestsProvider>
    </ClientsProvider>
  );
}
