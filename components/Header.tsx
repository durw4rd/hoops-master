"use client";

import { ChevronLeft, LogOut, Settings, SprayCan } from "lucide-react";
import { Group, UserProfile } from "@/lib/types";
import Image from "next/image";
import PlayerAvatar from "@/components/PlayerAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderProps {
  session: any;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenProfile?: () => void;
  userProfile?: UserProfile | null;
  currentGroup?: Group | null;
  onBackToGroups?: () => void;
}

export default function Header({
  session,
  onSignIn,
  onSignOut,
  onOpenProfile,
  userProfile,
  currentGroup,
  onBackToGroups,
}: HeaderProps) {
  const loggedInUser = session?.user;
  const isAdmin = userProfile?.globalRole === "admin";
  const handle = userProfile?.displayName || loggedInUser?.name || "Baller";

  // Shared settings menu. `onBanner` styles the trigger to stand out when it's
  // overlaid on the bright full-width logo banner (homepage).
  const settingsMenu = (onBanner: boolean) =>
    loggedInUser ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {userProfile?.pieceUrl ? (
            <button
              className={`rounded-full outline-none ring-2 ring-transparent hover:ring-[#FF6B1A] transition-all ${
                onBanner ? "shadow-[2px_2px_0_#1A1A1A]" : ""
              }`}
              aria-label="Settings"
            >
              <PlayerAvatar
                pieceUrl={userProfile.pieceUrl}
                name={handle}
                className="h-10 w-10 border-2 border-[#FF6B1A]"
              />
            </button>
          ) : (
            <button
              className={
                onBanner
                  ? "bg-[#1A1A1A] text-[#F2EFE9] p-2 rounded-md border-2 border-[#FF6B1A] shadow-[2px_2px_0_#1A1A1A] hover:bg-[#FF6B1A] hover:text-white transition-colors outline-none"
                  : "text-[#F2EFE9] hover:text-[#FF6B1A] transition-colors p-2 rounded-md hover:bg-white/10 outline-none"
              }
              aria-label="Settings"
            >
              <Settings className="w-6 h-6" />
            </button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="bg-[#1A1A1A] border-2 border-[#FF6B1A] text-[#F2EFE9] min-w-[200px]"
        >
          <DropdownMenuLabel className="font-marker text-[#7FFF00]">{handle}</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-[#FF6B1A]/30" />
          <DropdownMenuItem
            onClick={onOpenProfile}
            className="font-body cursor-pointer focus:bg-[#FF6B1A] focus:text-white"
          >
            <SprayCan className="w-4 h-4 mr-2" />
            Your Tag
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onSignOut}
            className="font-body cursor-pointer focus:bg-[#FF6B1A] focus:text-white"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Bounce
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : (
      <button onClick={onSignIn} className="sticker-btn text-sm py-2 px-4">
        Sign In
      </button>
    );

  // --- Crew pages: compact sticky bar with the centered logo + back button ---
  if (currentGroup) {
    return (
      <header className="bg-[#1A1A1A] sticky top-0 z-50 border-b-4 border-[#FF6B1A]">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-2 sm:py-2.5">
          <div className="relative flex items-center justify-center">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center gap-2 z-10">
              {onBackToGroups && (
                <button
                  onClick={onBackToGroups}
                  className="text-[#F2EFE9] hover:text-[#FF6B1A] transition-colors -ml-1 p-1.5 sm:p-2"
                  aria-label="Back to crews"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}
              {isAdmin && (
                <span className="badge-orange transform rotate-2 hidden sm:inline-flex">ADMIN</span>
              )}
            </div>

          <Image
            src="/logo-new-wide.png"
            alt="Hoops Master"
            width={1024}
            height={300}
            className="h-12 sm:h-14 w-auto drop-shadow-[2px_2px_0_rgba(0,0,0,0.3)]"
            priority
          />

            <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10">{settingsMenu(false)}</div>
          </div>
        </div>
      </header>
    );
  }

  // --- Homepage / pre-crew: full-width logo banner (scrolls away as a hero) ---
  return (
    <header className="relative bg-white border-b-4 border-[#FF6B1A]">
      <div className="max-w-4xl mx-auto relative">
        <Image
          src="/logo-new.png"
          alt="Hoops Master"
          width={1024}
          height={571}
          className="w-full h-auto max-h-[220px] sm:max-h-[320px] object-contain"
          priority
        />

        {/* Admin badge overlay (top-left) */}
        {isAdmin && (
          <span className="absolute top-3 left-3 badge-orange transform -rotate-2 shadow-[2px_2px_0_#1A1A1A] z-10">
            ADMIN
          </span>
        )}

        {/* Settings overlay (top-right) */}
        <div className="absolute top-3 right-3 z-10">{settingsMenu(true)}</div>
      </div>
    </header>
  );
}
