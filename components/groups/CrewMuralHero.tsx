"use client";

import Image from "next/image";
import { Calendar, Globe, Lock, Users } from "lucide-react";
import { Group } from "@/lib/types";

interface CrewMuralHeroProps {
  group: Group;
  memberCount: number;
  eventCount: number;
}

export default function CrewMuralHero({ group, memberCount, eventCount }: CrewMuralHeroProps) {
  const hasBanner = !!group.bannerUrl;

  const visibilityBadge =
    group.visibility === "private" ? (
      <span className="flex items-center gap-1 bg-asphalt text-sticker-white px-2 py-0.5 text-[10px] font-graffiti border border-sticker-white/30 flex-shrink-0">
        <Lock className="w-3 h-3" />
        PRIVATE
      </span>
    ) : (
      <span className="flex items-center gap-1 bg-moss-green text-asphalt px-2 py-0.5 text-[10px] font-graffiti border-2 border-asphalt flex-shrink-0 transform -rotate-1">
        <Globe className="w-3 h-3" />
        PUBLIC
      </span>
    );

  return (
    <div
      className="relative overflow-hidden border-4 border-asphalt shadow-sticker-lg mb-4 sm:mb-6"
      style={{ transform: "rotate(-0.3deg)" }}
    >
      <div className="relative aspect-[2/1] sm:aspect-[16/9] min-h-[200px] sm:min-h-[240px]">
        {hasBanner ? (
          <Image
            src={group.bannerUrl!}
            alt={`${group.name} mural`}
            fill
            className="object-cover"
            priority
          />
        ) : (
          <Image
            src="/placeholders/default-crew-wall.png"
            alt=""
            fill
            className="object-cover"
            priority
            aria-hidden
          />
        )}

        {/* Bottom-heavy scrim */}
        <div className="absolute inset-0 bg-gradient-to-t from-asphalt/85 via-asphalt/40 to-transparent" />

        {/* Content overlay */}
        <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">{visibilityBadge}</div>
              <h1 className="font-graffiti text-2xl sm:text-4xl text-sticker-white tracking-wide drop-shadow-[2px_2px_0_var(--asphalt-black)] break-words">
                {group.name}
              </h1>
              {!hasBanner && (
                <p className="font-marker text-moss-green text-sm mt-1 transform -rotate-1">
                  Your wall. Your crew.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="badge-purple text-[10px] flex items-center gap-1 transform -rotate-1">
                <Users className="w-3 h-3" />
                {memberCount} {memberCount === 1 ? "HEAD" : "HEADS"}
              </span>
              <span className="badge-blue text-[10px] flex items-center gap-1 transform rotate-1">
                <Calendar className="w-3 h-3" />
                {eventCount} {eventCount === 1 ? "GAME" : "GAMES"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
