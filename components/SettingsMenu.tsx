"use client";

import type { Session } from "next-auth";
import { useState } from "react";
import { Bell, LogOut, Settings, SprayCan } from "lucide-react";
import { UserProfile, Notification } from "@/lib/types";
import PlayerAvatar from "@/components/PlayerAvatar";
import NotificationsPanel from "@/components/NotificationsPanel";
import { useNotifications } from "@/hooks/useNotifications";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SettingsMenuProps {
  session: Session | null;
  userProfile?: UserProfile | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenProfile?: () => void;
  onNotificationNavigate?: (groupId: string, eventId: string) => void;
  /** Light backdrop behind trigger when overlaid on the logo */
  onLogo?: boolean;
}

export default function SettingsMenu({
  session,
  userProfile,
  onSignIn,
  onSignOut,
  onOpenProfile,
  onNotificationNavigate,
  onLogo = false,
}: SettingsMenuProps) {
  const loggedInUser = session?.user;
  const isAdmin = userProfile?.globalRole === "admin";
  const handle = userProfile?.displayName || loggedInUser?.name || "Baller";
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
  } = useNotifications(!!loggedInUser);

  const badgeLabel = unreadCount > 9 ? "9+" : String(unreadCount);

  const handleSelectNotification = async (n: Notification) => {
    if (!n.readAt) await markRead(n.id);
    setNotificationsOpen(false);
    onNotificationNavigate?.(n.groupId, n.eventId);
  };

  if (!loggedInUser) {
    return (
      <button onClick={onSignIn} className="sticker-btn text-sm py-2 px-4">
        Sign In
      </button>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {userProfile?.pieceUrl ? (
            <button
              className={`relative rounded-full outline-none ring-2 ring-transparent hover:ring-terracotta transition-all ${
                onLogo ? "shadow-sticker-sm ring-asphalt/10" : ""
              }`}
              aria-label="Settings"
            >
              <PlayerAvatar
                pieceUrl={userProfile.pieceUrl}
                name={handle}
                className="h-10 w-10 border-2 border-terracotta"
              />
              {unreadCount > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -top-1 -right-1 h-5 min-w-5 px-1 flex items-center justify-center text-[10px] font-graffiti border-2 border-asphalt rounded-full"
                >
                  {badgeLabel}
                </Badge>
              )}
            </button>
          ) : (
            <button
              className={
                onLogo
                  ? "relative bg-asphalt text-sticker-white p-2 rounded-md border-2 border-terracotta shadow-sticker-sm hover:bg-terracotta transition-colors outline-none"
                  : "relative text-asphalt hover:text-terracotta transition-colors p-2 rounded-md hover:bg-asphalt/5 outline-none"
              }
              aria-label="Settings"
            >
              <Settings className="w-6 h-6" />
              {unreadCount > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -top-1 -right-1 h-5 min-w-5 px-1 flex items-center justify-center text-[10px] font-graffiti border-2 border-asphalt rounded-full"
                >
                  {badgeLabel}
                </Badge>
              )}
            </button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="bg-asphalt border-2 border-terracotta text-sticker-white min-w-[200px]"
        >
          <DropdownMenuLabel className="font-marker text-moss-green flex items-center gap-2">
            {handle}
            {isAdmin && (
              <span className="badge-orange transform rotate-2 text-[10px]">ADMIN</span>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-terracotta/30" />
          <DropdownMenuItem
            onClick={() => setNotificationsOpen(true)}
            className="font-body cursor-pointer focus:bg-terracotta focus:text-white"
          >
            <Bell className="w-4 h-4 mr-2" />
            Fresh tags
            {unreadCount > 0 && (
              <span className="ml-auto badge-orange text-[10px] px-1.5 py-0.5">
                {badgeLabel}
              </span>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onOpenProfile}
            className="font-body cursor-pointer focus:bg-terracotta focus:text-white"
          >
            <SprayCan className="w-4 h-4 mr-2" />
            Your Tag
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onSignOut}
            className="font-body cursor-pointer focus:bg-terracotta focus:text-white"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Bounce
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <NotificationsPanel
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        notifications={notifications}
        loading={loading}
        unreadCount={unreadCount}
        onMarkAllRead={markAllRead}
        onSelect={handleSelectNotification}
      />
    </>
  );
}
