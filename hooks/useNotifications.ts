"use client";

import { useCallback, useEffect, useState } from "react";
import type { Notification } from "@/lib/types";

const POLL_MS = 60_000;

export function useNotifications(enabled: boolean) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      const res = await fetch("/api/user/notifications");
      if (!res.ok) return;
      const json = await res.json();
      setNotifications(json.data?.notifications ?? []);
      setUnreadCount(json.data?.unreadCount ?? 0);
    } catch {
      // ignore — will retry on focus/poll
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!enabled) return;
    const onFocus = () => fetchNotifications();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [enabled, fetchNotifications]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(fetchNotifications, POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, fetchNotifications]);

  const markRead = useCallback(
    async (notificationId: string) => {
      const res = await fetch(`/api/user/notifications/${notificationId}`, {
        method: "PATCH",
      });
      if (!res.ok) return;
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId
            ? { ...n, readAt: new Date().toISOString() }
            : n
        )
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    },
    []
  );

  const markAllRead = useCallback(async () => {
    const res = await fetch("/api/user/notifications/read-all", {
      method: "POST",
    });
    if (!res.ok) return;
    const json = await res.json();
    setNotifications(json.data?.notifications ?? []);
    setUnreadCount(0);
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    refresh: fetchNotifications,
  };
}
