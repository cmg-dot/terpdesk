"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getMyNotifications, markAllNotificationsRead, markNotificationRead } from "@/app/actions/notificationActions";
import type { MyNotification } from "@/app/actions/notificationActions";

const POLL_MS = 60_000;

/** Global bell: the signed-in user's rows from the `notifications` table (the server scopes them to the session). */
export function NotificationBell() {
  const { status } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<MyNotification[]>([]);
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      setItems(await getMyNotifications());
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

  const unreadCount = items.filter((n) => !n.isRead).length;

  const handleClick = (item: MyNotification) => {
    setIsOpen(false);
    if (!item.isRead) {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
      void markNotificationRead(item.id).then((ok) => {
        if (!ok) refresh();
      });
    }
    if (item.href) router.push(item.href);
  };

  const handleMarkAll = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    if (!(await markAllNotificationsRead())) refresh();
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        className="relative text-slate-500 hover:text-slate-700 mt-1"
        onClick={() => {
          if (!isOpen) refresh();
          setIsOpen(!isOpen);
        }}
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
        // Phones: a panel pinned 12px from both screen edges, just below the header, so it can never run off-screen (the
        // bell sits ~64px in from the right, so a fixed 320px box anchored to it was cut off on the left).
        // 640px and up: the bell-anchored dropdown, capped to the viewport.
        <div className="fixed inset-x-3 top-[4.5rem] z-50 flex max-h-[min(400px,calc(100dvh-6rem))] origin-top-right flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80 sm:max-w-[calc(100vw-2rem)] sm:max-h-[400px]">
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
                    key={notif.id}
                    onClick={() => handleClick(notif)}
                    className={`text-left px-4 py-4 border-b border-gray-50 last:border-b-0 hover:bg-gray-50 transition-colors ${
                      notif.isRead ? "bg-white" : "bg-[#F9F8F4]"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {!notif.isRead && <div className="mt-1.5 w-2 h-2 rounded-full bg-[#0B3B32] shrink-0" />}
                      <div className={`flex min-w-0 flex-col gap-1 break-words ${notif.isRead ? "ml-5" : ""}`}>
                        <span className={`text-sm ${notif.isRead ? "font-medium text-gray-700" : "font-semibold text-gray-900"}`}>
                          {notif.title}
                        </span>
                        <span className="text-[13px] text-gray-500 leading-snug">{notif.message}</span>
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
