"use client";

import { LogOut, Settings, SprayCan } from "lucide-react";
import { UserProfile } from "@/lib/types";
import PlayerAvatar from "@/components/PlayerAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SettingsMenuProps {
  session: any;
  userProfile?: UserProfile | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenProfile?: () => void;
  /** Light backdrop behind trigger when overlaid on the logo */
  onLogo?: boolean;
}

export default function SettingsMenu({
  session,
  userProfile,
  onSignIn,
  onSignOut,
  onOpenProfile,
  onLogo = false,
}: SettingsMenuProps) {
  const loggedInUser = session?.user;
  const isAdmin = userProfile?.globalRole === "admin";
  const handle = userProfile?.displayName || loggedInUser?.name || "Baller";

  if (!loggedInUser) {
    return (
      <button onClick={onSignIn} className="sticker-btn text-sm py-2 px-4">
        Sign In
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {userProfile?.pieceUrl ? (
          <button
            className={`rounded-full outline-none ring-2 ring-transparent hover:ring-terracotta transition-all ${
              onLogo ? "shadow-sticker-sm ring-asphalt/10" : ""
            }`}
            aria-label="Settings"
          >
            <PlayerAvatar
              pieceUrl={userProfile.pieceUrl}
              name={handle}
              className="h-10 w-10 border-2 border-terracotta"
            />
          </button>
        ) : (
          <button
            className={
              onLogo
                ? "bg-asphalt text-sticker-white p-2 rounded-md border-2 border-terracotta shadow-sticker-sm hover:bg-terracotta transition-colors outline-none"
                : "text-asphalt hover:text-terracotta transition-colors p-2 rounded-md hover:bg-asphalt/5 outline-none"
            }
            aria-label="Settings"
          >
            <Settings className="w-6 h-6" />
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
  );
}
