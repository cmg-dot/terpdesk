"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useGlobalState } from "@/context/GlobalContext";
import { getMyNotifications, markAllNotificationsRead, markNotificationRead } from "@/app/actions/notificationActions";
import type { MyNotification } from "@/app/actions/notificationActions";

const POLL_MS = 60_000;

interface BellItem {
  id: string;
  title: string;
  body: string;
  href?: string;
  isRead: boolean;
  createdAt: number;
  /** "server" rows live in the notifications table; "local" rows are the older in-browser ones. */
  source: "server" | "local";
}

const fromServer = (n: MyNotification): BellItem => ({
  id: n.id,
  title: n.title,
  body: n.message,
  href: n.href ?? undefined,
  isRead: n.isRead,
  createdAt: new Date(n.createdAt).getTime(),
  source: "server",
});

export function NotificationBell() {
  const { notifications, currentUser, markNotificationAsRead } = useGlobalState();
  const { status } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [serverItems, setServerItems] = useState<BellItem[]>([]);
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const rows = await getMyNotifications();
      setServerItems(rows.map(fromServer));
    } catch {
      // Signed out or a transient error: keep what is shown.
    }
  }, []);

  // Load on sign-in, then poll quietly while the tab is visible.
  useEffect(() => {
    if (status !== "authenticated") return;
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [status, refresh]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const items = useMemo<BellItem[]>(() => {
    const local = notifications
      .filter((n) => (currentUser.role === "agency" ? n.recipient_id === currentUser.agency_id : n.recipient_id === currentUser.id))
      .map<BellItem>((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        href: n.href,
        isRead: n.read_at !== null,
        createdAt: new Date(n.created_at).getTime(),
        source: "local",
      }));
    return [...serverItems, ...local].sort((a, b) => b.createdAt - a.createdAt);
  }, [serverItems, notifications, currentUser]);

  const unreadCount = items.filter((n) => !n.isRead).length;

  const markRead = async (item: BellItem) => {
    if (item.isRead) return;
    if (item.source === "local") {
      markNotificationAsRead(item.id);
      return;
    }
    setServerItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
    if (!(await markNotificationRead(item.id))) refresh();
  };

  const handleClick = (item: BellItem) => {
    void markRead(item);
    setIsOpen(false);
    if (item.href) router.push(item.href);
  };

  const handleMarkAll = async () => {
    items.filter((n) => !n.isRead && n.source === "local").forEach((n) => markNotificationAsRead(n.id));
    setServerItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    if (!(await markAllNotificationsRead())) refresh();
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        className="relative text-slate-500 hover:text-slate-700 mt-1"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#9E3929] px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 shadow-lg rounded-2xl z-50 overflow-hidden flex flex-col max-h-[400px]">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
            <h3 className="font-semibold text-[15px] text-gray-800 tracking-tight">Notifications</h3>
            {unreadCount > 0 && (
              <button type="button" onClick={handleMarkAll} className="text-xs font-medium text-[#0B3B32] hover:underline">
                Mark all as read
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500">No notifications yet.</div>
            ) : (
              <div className="flex flex-col">
                {items.map((notif) => (
                  <button
                    key={`${notif.source}-${notif.id}`}
                    onClick={() => handleClick(notif)}
                    className={`text-left px-4 py-4 border-b border-gray-50 last:border-b-0 hover:bg-gray-50 transition-colors ${
                      notif.isRead ? "bg-white" : "bg-[#F9F8F4]"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {!notif.isRead && <div className="mt-1.5 w-2 h-2 rounded-full bg-[#0B3B32] shrink-0" />}
                      <div className={`flex flex-col gap-1 ${notif.isRead ? "ml-5" : ""}`}>
                        <span className={`text-sm ${notif.isRead ? "font-medium text-gray-700" : "font-semibold text-gray-900"}`}>
                          {notif.title}
                        </span>
                        <span className="text-[13px] text-gray-500 leading-snug">{notif.body}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
