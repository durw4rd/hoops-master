"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChevronLeft, LogOut } from "lucide-react";
import { Group, UserProfile } from "@/lib/types";
import Image from "next/image";

interface HeaderProps {
  session: any;
  onSignIn: () => void;
  onSignOut: () => void;
  userProfile?: UserProfile | null;
  currentGroup?: Group | null;
  onBackToGroups?: () => void;
}

export default function Header({ 
  session, 
  onSignIn, 
  onSignOut, 
  userProfile,
  currentGroup,
  onBackToGroups 
}: HeaderProps) {
  const loggedInUser = session?.user;
  const isAdmin = userProfile?.globalRole === 'admin';

  return (
    <header className="bg-[#1A1A1A] sticky top-0 z-50 border-b-4 border-[#FF6B1A]">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-2 sm:py-2.5">
        <div className="flex items-center justify-between">
          {/* Left side - Logo and title */}
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
            {currentGroup && onBackToGroups ? (
              <button
                onClick={onBackToGroups}
                className="text-[#F2EFE9] hover:text-[#FF6B1A] transition-colors -ml-1 sm:-ml-2 p-1.5 sm:p-2"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            ) : null}
            
            <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
              <Image
                src="/logo-clean-80.png"
                alt="Hoops Master"
                width={86}
                height={48}
                className="flex-shrink-0"
                priority
              />
              {currentGroup ? (
                <div className="min-w-0">
                  <h1 className="font-graffiti text-lg sm:text-xl text-[#FF6B1A] leading-tight truncate tracking-wide">
                    {currentGroup.name}
                  </h1>
                  <p className="text-[10px] sm:text-xs text-[#7FFF00] font-marker">Hoops Master</p>
                </div>
              ) : (
                isAdmin && (
                  <span className="badge-orange transform rotate-2">
                    ADMIN
                  </span>
                )
              )}
            </div>
          </div>

          {/* Right side - User info */}
          <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
            {loggedInUser ? (
              <>
                <div className="hidden sm:block text-right">
                  <p className="font-marker text-sm text-[#7FFF00] leading-tight">
                    {userProfile?.displayName || loggedInUser.name}
                  </p>
                  <p className="text-[10px] text-[#F2EFE9]/60 font-body">
                    {loggedInUser.email}
                  </p>
                </div>
                <Avatar className="w-8 h-8 sm:w-9 sm:h-9 ring-2 ring-[#FF6B1A] border-2 border-[#1A1A1A]">
                  <AvatarImage 
                    src={loggedInUser.image} 
                    alt={loggedInUser.name || "User"} 
                  />
                  <AvatarFallback className="bg-[#8B5CF6] text-white font-graffiti text-sm">
                    {loggedInUser.name
                      ?.split(" ")
                      .map((n: string) => n[0])
                      .join("")
                      .toUpperCase() || "?"}
                  </AvatarFallback>
                </Avatar>
                <button 
                  onClick={onSignOut}
                  className="text-[#F2EFE9] hover:text-[#FF6B1A] transition-colors p-1.5 sm:p-2"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button 
                onClick={onSignIn}
                className="sticker-btn text-sm py-2 px-4"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
