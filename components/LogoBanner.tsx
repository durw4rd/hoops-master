"use client";

import Image from "next/image";
import { UserProfile } from "@/lib/types";
import SettingsMenu from "@/components/SettingsMenu";

interface LogoBannerProps {
  session: any;
  userProfile?: UserProfile | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenProfile?: () => void;
}

/** Full-width logo integrated into the concrete page canvas (not a separate chrome strip). */
export default function LogoBanner({
  session,
  userProfile,
  onSignIn,
  onSignOut,
  onOpenProfile,
}: LogoBannerProps) {
  return (
    <div className="relative max-w-4xl mx-auto border-b-4 border-terracotta">
      <Image
        src="/logo-new.png"
        alt="Hoops Master"
        width={1024}
        height={571}
        className="w-full h-auto max-h-[200px] sm:max-h-[280px] object-contain object-center"
        priority
      />
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10">
        <SettingsMenu
          session={session}
          userProfile={userProfile}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
          onOpenProfile={onOpenProfile}
          onLogo
        />
      </div>
    </div>
  );
}
