"use client";

import { Group } from "@/lib/types";
import { Users, Calendar, Lock, Globe, ChevronRight } from "lucide-react";

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
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-graffiti text-xl text-[#1A1A1A] truncate tracking-wide">
                  {group.name}
                </h3>
                {group.visibility === 'private' ? (
                  <span className="flex items-center gap-1 bg-[#1A1A1A] text-[#F2EFE9] px-2 py-0.5 text-[10px] font-graffiti border border-[#1A1A1A]">
                    <Lock className="w-3 h-3" />
                    PRIVATE
                  </span>
                ) : (
                  <span className="flex items-center gap-1 bg-[#96E600] text-[#1A1A1A] px-2 py-0.5 text-[10px] font-graffiti border-2 border-[#1A1A1A]">
                    <Globe className="w-3 h-3" />
                    PUBLIC
                  </span>
                )}
              </div>
              {group.description && (
                <p className="text-sm text-[#1A1A1A]/60 mt-1 truncate font-body">
                  {group.description}
                </p>
              )}
              <div className="flex items-center gap-3 mt-2">
                <span className="flex items-center gap-1 text-xs text-[#1A1A1A]/50 font-body">
                  <Calendar className="w-3.5 h-3.5" />
                  {group.defaultEventSpots} spots/event
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
