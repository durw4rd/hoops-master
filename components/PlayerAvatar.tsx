"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface PlayerAvatarProps {
  /** The player's "piece" (profile picture) URL, if set. */
  pieceUrl?: string | null;
  /** Display name, used to derive initials for the fallback. */
  name?: string;
  className?: string;
}

function initials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * A player's "piece" rendered as a graffiti-styled circular avatar. Falls back
 * to the player's initials on a graffiti-blue chip when no piece is set.
 */
export default function PlayerAvatar({ pieceUrl, name, className }: PlayerAvatarProps) {
  return (
    <Avatar className={cn("border-2 border-[#1A1A1A] bg-[#0084FF]", className)}>
      {pieceUrl && <AvatarImage src={pieceUrl} alt={name ?? "Piece"} className="object-cover" />}
      <AvatarFallback className="bg-[#0084FF] text-white font-graffiti text-xs">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
