"use client";

import { ChevronLeft, LogOut, Settings, SprayCan } from "lucide-react";
import { Group, UserProfile } from "@/lib/types";
import Image from "next/image";
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
        <div className="flex items-center justify-between gap-3">
          {/* Left side - logo / crew banner */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {currentGroup && onBackToGroups ? (
              <button
                onClick={onBackToGroups}
                className="text-[#F2EFE9] hover:text-[#FF6B1A] transition-colors -ml-1 p-1.5 sm:p-2 flex-shrink-0"
                aria-label="Back to crews"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            ) : null}

            {currentGroup ? (
              currentGroup.bannerUrl ? (
                <div className="relative h-12 sm:h-14 flex-1 min-w-0 rounded-md overflow-hidden border-2 border-[#FF6B1A]/40">
                  <Image
                    src={currentGroup.bannerUrl}
                    alt={currentGroup.name}
                    fill
                    className="object-cover"
                    priority
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent flex items-center px-3">
                    <h1 className="font-graffiti text-lg sm:text-2xl text-white leading-tight truncate tracking-wide drop-shadow-[2px_2px_0_rgba(0,0,0,0.8)]">
                      {currentGroup.name}
                    </h1>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <Image
                    src="/logo-clean-80.png"
                    alt="Hoops Master"
                    width={86}
                    height={48}
                    className="flex-shrink-0"
                    priority
                  />
                  <div className="min-w-0">
                    <h1 className="font-graffiti text-lg sm:text-xl text-[#FF6B1A] leading-tight truncate tracking-wide">
                      {currentGroup.name}
                    </h1>
                    <p className="text-[10px] sm:text-xs text-[#7FFF00] font-marker">Hoops Master</p>
                  </div>
                </div>
              )
            ) : (
              <div className="flex items-center gap-3 min-w-0">
                <Image
                  src="/logo-clean-80.png"
                  alt="Hoops Master"
                  width={140}
                  height={78}
                  className="flex-shrink-0 h-12 sm:h-14 w-auto"
                  priority
                />
                {isAdmin && (
                  <span className="badge-orange transform rotate-2">ADMIN</span>
                )}
              </div>
            )}
          </div>

          {/* Right side - settings menu */}
          <div className="flex items-center flex-shrink-0">
            {loggedInUser ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="text-[#F2EFE9] hover:text-[#FF6B1A] transition-colors p-2 rounded-md hover:bg-white/10 outline-none"
                    aria-label="Settings"
                  >
                    <Settings className="w-6 h-6" />
                  </button>
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
