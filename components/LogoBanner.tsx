"use client";

import Image from "next/image";
import { BookText, ChevronLeft, ScrollText } from "lucide-react";
import { UserProfile } from "@/lib/types";
import SettingsMenu from "@/components/SettingsMenu";

interface LogoBannerProps {
  session: any;
  userProfile?: UserProfile | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenProfile?: () => void;
  onOpenBlackBook?: () => void;
  onOpenVocab?: () => void;
}

/** Home mural — same chrome as crew banner (sticky profile row + framed hero). */
export default function LogoBanner({
  session,
  userProfile,
  onSignIn,
  onSignOut,
  onOpenProfile,
  onOpenBlackBook,
  onOpenVocab,
}: LogoBannerProps) {
  return (
    <>
      <div className="sticky top-0 z-40 -mx-4 px-4 py-2 mb-3 flex items-center gap-2 concrete-bg">
        {/* Left: Black Book (admin only) */}
        {onOpenBlackBook ? (
          <button
            type="button"
            onClick={onOpenBlackBook}
            className="sticker-btn-outline flex items-center gap-1.5 text-sm py-1.5 px-3 shrink-0"
            title="Manage players — invites and admin roles"
          >
            <BookText className="w-4 h-4 shrink-0" />
            Black Book
          </button>
        ) : (
          <span
            className="flex items-center gap-1 font-graffiti text-base sm:text-lg invisible select-none"
            aria-hidden
          >
            <ChevronLeft className="w-6 h-6 shrink-0" />
            Crews
          </span>
        )}

        {/* Vocab — always visible when logged in */}
        {onOpenVocab && (
          <button
            type="button"
            onClick={onOpenVocab}
            className="sticker-btn-outline flex items-center gap-1.5 text-sm py-1.5 px-3 shrink-0"
            title="Street glossary"
          >
            <ScrollText className="w-4 h-4 shrink-0" />
            Vocab
          </button>
        )}

        {/* Profile / settings pushed to far right */}
        <span className="ml-auto" />
        <SettingsMenu
          session={session}
          userProfile={userProfile}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
          onOpenProfile={onOpenProfile}
        />
      </div>

      <div
        className="relative overflow-hidden border-4 border-asphalt shadow-sticker-lg mb-4 sm:mb-6"
        style={{ transform: "rotate(-0.3deg)" }}
      >
        <div className="relative aspect-[1024/571] min-h-[200px] sm:min-h-[260px]">
          <Image
            src="/logo-new.png"
            alt="Hoops Master"
            fill
            className="object-cover object-center"
            priority
            sizes="(max-width: 896px) 100vw, 896px"
          />
        </div>
      </div>
    </>
  );
}
