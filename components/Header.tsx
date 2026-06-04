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

  return (
    <header className="bg-[#1A1A1A] sticky top-0 z-50 border-b-4 border-[#FF6B1A]">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-2 sm:py-2.5">
        <div className="relative flex items-center justify-center">
          {/* Left controls - back button + admin badge */}
          <div className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center gap-2 z-10">
            {currentGroup && onBackToGroups && (
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

          {/* Center - Hoops Master logo (always) */}
          <Image
            src="/logo-clean-400.png"
            alt="Hoops Master"
            width={400}
            height={200}
            className="h-20 sm:h-28 w-auto drop-shadow-[2px_2px_0_rgba(0,0,0,0.5)]"
            priority
          />

          {/* Right controls - settings menu */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10">
            {loggedInUser ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  {userProfile?.pieceUrl ? (
                    <button
                      className="rounded-full outline-none ring-2 ring-transparent hover:ring-[#FF6B1A] transition-all"
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
                      className="text-[#F2EFE9] hover:text-[#FF6B1A] transition-colors p-2 rounded-md hover:bg-white/10 outline-none"
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
                  <DropdownMenuLabel className="font-marker text-[#7FFF00]">
                    {handle}
                  </DropdownMenuLabel>
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
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
