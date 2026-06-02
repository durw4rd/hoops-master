"use client";

import { Group } from "@/lib/types";
import LineupEditor from "./LineupEditor";

interface MemberRow {
  userEmail: string;
  displayName: string;
}

interface RosterTabProps {
  groupId: string;
  group: Group;
  members: MemberRow[];
}

export default function RosterTab({ groupId, members }: RosterTabProps) {
  return (
    <div className="space-y-4">
      {/* How it works */}
      <div className="marker-card p-4 bg-[#FFD700]/15">
        <h3 className="font-graffiti text-xl text-[#1A1A1A] mb-1">The Rotation</h3>
        <p className="text-sm text-[#1A1A1A]/70 font-body">
          Got more writers than spots? Set your lineup order below and pick who&apos;s in. When you
          drop a recurring game and choose <span className="font-graffiti">Rotation</span> as the
          assignment mode, the crew slides down this list across every game so everyone gets their
          reps. Build the games from{" "}
          <span className="font-graffiti">Drop a Game → Recurring → Rotation</span>.
        </p>
      </div>

      <div className="marker-card p-4">
        <LineupEditor groupId={groupId} members={members} />
      </div>
    </div>
  );
}
