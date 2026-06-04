"use client";

import { ChevronLeft } from "lucide-react";
import { Group, UserProfile } from "@/lib/types";
import SettingsMenu from "@/components/SettingsMenu";

interface AppHeaderProps {
  session: any;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenProfile?: () => void;
  userProfile?: UserProfile | null;
  currentGroup: Group;
  onBackToGroups?: () => void;
}

/** Compact nav on crew pages — matches concrete canvas, no drip, no cropped logo. */
export default function AppHeader({
  session,
  onSignIn,
  onSignOut,
  onOpenProfile,
  userProfile,
  currentGroup: _currentGroup,
  onBackToGroups,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-concrete border-b-4 border-terracotta">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-2.5 flex items-center justify-between">
        {onBackToGroups ? (
          <button
            onClick={onBackToGroups}
            className="flex items-center gap-1 text-asphalt hover:text-terracotta transition-colors p-1 -ml-1 font-graffiti text-base sm:text-lg"
            aria-label="Back to crews"
          >
            <ChevronLeft className="w-6 h-6 shrink-0" />
            <span className="hidden sm:inline">Crews</span>
          </button>
        ) : (
          <span />
        )}
        <SettingsMenu
          session={session}
          userProfile={userProfile}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
          onOpenProfile={onOpenProfile}
        />
      </div>
    </header>
  );
}
