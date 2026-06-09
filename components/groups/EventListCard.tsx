"use client";

import Image from "next/image";
import { Clock, MapPin, Users, ChevronRight } from "lucide-react";
import type { BannerOrientation, EventType } from "@/lib/types";

export interface EventListCardData {
  eventId: string;
  date: string;
  startTime: string;
  endTime: string;
  location?: string;
  name?: string;
  description?: string;
  eventType?: EventType;
  bannerUrl?: string | null;
  bannerOrientation?: BannerOrientation;
  totalSpots: number;
  attendeeCount: number;
  availableSpots: number;
  offeredCount: number;
  waitlistCount?: number;
  isAttending?: boolean;
  onWaitlist?: boolean;
  hasRider?: boolean;
}

interface EventListCardProps {
  event: EventListCardData;
  index: number;
  onClick: () => void;
}

const BANNER_HEIGHT = "h-28";

function EventDetails({ event }: { event: EventListCardData }) {
  return (
    <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
      <div className="w-14 h-14 sm:w-16 sm:h-16 bg-terracotta border-2 border-asphalt flex flex-col items-center justify-center flex-shrink-0 shadow-sticker-sm">
        <span className="text-[9px] sm:text-[10px] text-white font-graffiti uppercase">
          {new Date(event.date).toLocaleDateString("en-US", { weekday: "short" })}
        </span>
        <span className="text-xl sm:text-2xl font-graffiti text-white">
          {new Date(event.date).getDate()}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
          <Clock className="w-4 h-4 text-slate-blue" />
          <span className="font-graffiti text-asphalt text-base sm:text-lg">
            {event.startTime} - {event.endTime}
          </span>
          {event.eventType === "special" && (
            <span className="tag-label-orange text-[10px] transform rotate-0">SPECIAL</span>
          )}
          {event.isAttending && (
            <>
              <span className="badge-green text-[10px]">YOU&apos;RE IN</span>
              {event.hasRider && (
                <span className="text-[10px] font-graffiti bg-dull-gold text-asphalt px-1.5 py-0.5 border border-asphalt">
                  +1
                </span>
              )}
            </>
          )}
          {!event.isAttending && event.onWaitlist && (
            <span className="badge-blue text-[10px]">ON THE BENCH</span>
          )}
        </div>

        {event.eventType === "special" && event.name && (
          <p className="font-graffiti text-asphalt text-base line-clamp-2 break-words mb-1">
            {event.name}
          </p>
        )}
        {event.eventType !== "special" && event.description && (
          <p className="text-sm text-asphalt/60 line-clamp-2 break-words font-body mb-1">
            {event.description}
          </p>
        )}

        <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-asphalt/60 font-body">
          {event.location && (
            <span className="flex items-center gap-1 truncate max-w-[100px] sm:max-w-none">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{event.location}</span>
            </span>
          )}
          <span className="flex items-center gap-1 font-graffiti text-asphalt">
            <Users className="w-3.5 h-3.5" />
            {event.availableSpots <= 0 ? "FULL" : `${event.attendeeCount}/${event.totalSpots}`}
          </span>
          {event.offeredCount > 0 && (
            <span className="badge-orange text-[10px]">{event.offeredCount} OPEN</span>
          )}
          {event.availableSpots <= 0 && (event.waitlistCount ?? 0) > 0 && (
            <span className="badge-blue text-[10px]">{event.waitlistCount} ON THE BENCH</span>
          )}
        </div>
      </div>

      <div className="w-10 h-10 rounded-full bg-slate-blue border-2 border-asphalt flex items-center justify-center group-hover:bg-terracotta transition-colors flex-shrink-0 shadow-sticker-sm">
        <ChevronRight className="w-5 h-5 text-white" />
      </div>
    </div>
  );
}

export default function EventListCard({ event, index, onClick }: EventListCardProps) {
  const rotation = `rotate(${index % 2 === 0 ? -0.3 : 0.3}deg)`;
  const borderAccent = event.isAttending
    ? "border-l-[6px] border-l-moss-green"
    : event.onWaitlist
      ? "border-l-[6px] border-l-slate-blue"
      : "";

  if (event.eventType === "special") {
    const isPortrait = !!event.bannerUrl && event.bannerOrientation === "portrait";

    if (isPortrait) {
      return (
        <div
          className={`poster-frame p-0 overflow-hidden hover:shadow-sticker-soft-lg transition-all cursor-pointer group ${borderAccent}`}
          style={{ transform: rotation }}
          onClick={onClick}
        >
          <div className="flex">
            {event.bannerUrl && (
              <div className="relative w-28 sm:w-36 shrink-0 self-stretch border-r-2 border-asphalt overflow-hidden">
                <Image src={event.bannerUrl} alt="" fill className="object-cover" />
              </div>
            )}
            <div className="flex-1 min-w-0 p-4">
              <EventDetails event={event} />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        className={`poster-frame p-4 hover:shadow-sticker-soft-lg transition-all cursor-pointer group ${borderAccent}`}
        style={{ transform: rotation }}
        onClick={onClick}
      >
        {event.bannerUrl && (
          <div
            className={`relative -mx-4 -mt-4 mb-3 ${BANNER_HEIGHT} overflow-hidden border-b-2 border-asphalt grain-overlay`}
          >
            <Image src={event.bannerUrl} alt="" fill className="object-cover" />
          </div>
        )}
        <EventDetails event={event} />
      </div>
    );
  }

  return (
    <div
      className={`marker-card p-4 hover:shadow-sticker-soft-lg transition-all cursor-pointer group ${borderAccent}`}
      style={{ transform: rotation }}
      onClick={onClick}
    >
      <EventDetails event={event} />
    </div>
  );
}
