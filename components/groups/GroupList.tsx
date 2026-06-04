"use client";

import { Group } from "@/lib/types";
import { Users, Calendar, Lock, Globe, ChevronRight } from "lucide-react";
import Image from "next/image";

interface GroupListProps {
  groups: Group[];
  loading: boolean;
  onSelectGroup: (group: Group) => void;
  userEmail: string;
}

export default function GroupList({ groups, loading, onSelectGroup, userEmail }: GroupListProps) {
  if (loading) {
    return (
      <div className="grid gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="marker-card p-4 animate-pulse">
            <div className="flex items-center justify-between">
              <div className="space-y-2 flex-1">
                <div className="h-6 w-40 bg-[#1A1A1A]/10 rounded" />
                <div className="h-4 w-64 bg-[#1A1A1A]/5 rounded" />
              </div>
              <div className="h-8 w-8 bg-[#1A1A1A]/10 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="marker-card p-8 border-dashed border-[#1A1A1A]/30">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 mx-auto rounded-full bg-[#0084FF]/20 border-3 border-[#1A1A1A] flex items-center justify-center">
            <Users className="w-10 h-10 text-[#0084FF]" />
          </div>
          <div>
            <h3 className="font-graffiti text-2xl text-[#1A1A1A]">No Crews Yet!</h3>
            <p className="text-[#1A1A1A]/60 text-sm mt-2 font-body">
              Create a new crew or join an existing one to get started
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {groups.map((group, index) => (
        <div 
          key={group.groupId}
          className="marker-card p-4 hover:shadow-[6px_6px_0_rgba(26,26,26,0.2)] transition-all cursor-pointer group"
          style={{ transform: `rotate(${index % 2 === 0 ? -0.5 : 0.5}deg)` }}
          onClick={() => onSelectGroup(group)}
        >
          {group.bannerUrl && (
            <div className="relative -mx-4 -mt-4 mb-3 h-24 overflow-hidden border-b-2 border-[#1A1A1A]">
              <Image
                src={group.bannerUrl}
                alt={group.name}
                fill
                className="object-cover"
              />
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2 min-w-0">
                <h3 className="font-graffiti text-xl text-[#1A1A1A] tracking-wide min-w-0 break-words line-clamp-2">
                  {group.name}
                </h3>
                {group.visibility === 'private' ? (
                  <span className="flex items-center gap-1 bg-[#1A1A1A] text-[#F2EFE9] px-2 py-0.5 text-[10px] font-graffiti border border-[#1A1A1A] flex-shrink-0 mt-1">
                    <Lock className="w-3 h-3" />
                    PRIVATE
                  </span>
                ) : (
                  <span className="flex items-center gap-1 bg-[#96E600] text-[#1A1A1A] px-2 py-0.5 text-[10px] font-graffiti border-2 border-[#1A1A1A] flex-shrink-0 mt-1">
                    <Globe className="w-3 h-3" />
                    PUBLIC
                  </span>
                )}
              </div>
              {group.description && (
                <p className="text-sm text-[#1A1A1A]/60 mt-1 line-clamp-2 break-words font-body">
                  {group.description}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="badge-purple text-[10px] flex items-center gap-1 transform -rotate-1">
                  <Users className="w-3 h-3" />
                  {group.memberCount ?? 0} {(group.memberCount ?? 0) === 1 ? "HEAD" : "HEADS"}
                </span>
                <span className="badge-blue text-[10px] flex items-center gap-1 transform rotate-1">
                  <Calendar className="w-3 h-3" />
                  {group.eventCount ?? 0} {(group.eventCount ?? 0) === 1 ? "GAME" : "GAMES"}
                </span>
                {group.createdBy === userEmail && (
                  <span className="tag-label-orange text-[10px] transform rotate-0">
                    OWNER
                  </span>
                )}
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-[#FF5A00] border-2 border-[#1A1A1A] flex items-center justify-center group-hover:bg-[#0084FF] transition-colors flex-shrink-0 shadow-[2px_2px_0_#1A1A1A]">
              <ChevronRight className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
