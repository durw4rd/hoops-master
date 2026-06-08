"use client";

import { Bell, Loader2 } from "lucide-react";
import { GraffitiDialog } from "@/components/ui/GraffitiDialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { Notification } from "@/lib/types";

interface NotificationsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notifications: Notification[];
  loading: boolean;
  unreadCount: number;
  onMarkAllRead: () => void;
  onSelect: (notification: Notification) => void;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotificationsPanel({
  open,
  onOpenChange,
  notifications,
  loading,
  unreadCount,
  onMarkAllRead,
  onSelect,
}: NotificationsPanelProps) {
  return (
    <GraffitiDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <Bell className="w-6 h-6" />
          Fresh tags
        </span>
      }
      description="What went down on the court while you were out."
      className="max-w-md"
      footer={
        unreadCount > 0 ? (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="sticker-btn-outline text-sm py-2 px-4"
          >
            Clear the wall
          </button>
        ) : undefined
      }
    >
      {loading && notifications.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-asphalt/60 font-body">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading...
        </div>
      ) : notifications.length === 0 ? (
        <p className="text-center py-12 text-asphalt/50 font-body text-sm">
          All quiet — no fresh tags.
        </p>
      ) : (
        <ScrollArea className="max-h-[min(50vh,360px)] pr-2">
          <ul className="space-y-0">
            {notifications.map((n, i) => {
              const unread = !n.readAt;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(n)}
                    className={`w-full text-left py-3 px-1 transition-colors hover:bg-asphalt/5 ${
                      unread ? "border-l-4 border-terracotta pl-2" : "border-l-4 border-transparent pl-2"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-graffiti text-asphalt text-sm leading-tight">
                        {n.title}
                      </p>
                      <span className="text-[10px] text-asphalt/40 font-body shrink-0 pt-0.5">
                        {formatRelativeTime(n.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-asphalt/70 font-body mt-1 leading-snug">
                      {n.body}
                    </p>
                  </button>
                  {i < notifications.length - 1 && (
                    <Separator className="bg-terracotta/20" />
                  )}
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}
    </GraffitiDialog>
  );
}
