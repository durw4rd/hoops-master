"use client";

import { useState, useEffect, useCallback } from "react";
import { Group } from "@/lib/types";
import { Loader2, ArrowUp, ArrowDown, Save } from "lucide-react";

interface RosterRow {
  userEmail: string;
  displayName: string;
  isActive: boolean;
}

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
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRoster = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/roster`);
      const data = await res.json();
      const existing: RosterRow[] = res.ok ? data.data || [] : [];
      // Merge: keep saved order/flags, append any members not yet in the roster.
      const byEmail = new Map(existing.map((r) => [r.userEmail.toLowerCase(), r]));
      const merged: RosterRow[] = existing.map((r) => ({ ...r }));
      for (const m of members) {
        if (!byEmail.has(m.userEmail.toLowerCase())) {
          merged.push({ userEmail: m.userEmail, displayName: m.displayName, isActive: true });
        }
      }
      setRoster(merged);
    } catch {
      setError("Couldn't load the roster");
    } finally {
      setLoading(false);
    }
  }, [groupId, members]);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  const move = (index: number, dir: -1 | 1) => {
    setRoster((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
    setSaved(false);
  };

  const toggleActive = (email: string) => {
    setRoster((prev) =>
      prev.map((r) => (r.userEmail === email ? { ...r, isActive: !r.isActive } : r))
    );
    setSaved(false);
  };

  const saveRoster = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/roster`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: roster.map((r) => ({ userEmail: r.userEmail, isActive: r.isActive })),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Couldn't save the roster");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Couldn't save the roster");
    } finally {
      setSaving(false);
    }
  };

  const activeCount = roster.filter((r) => r.isActive).length;

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

      {error && (
        <div className="p-2 bg-[#FF5A00]/10 border-2 border-[#FF5A00]">
          <p className="text-sm text-[#FF5A00] font-body">{error}</p>
        </div>
      )}

      {/* Roster order */}
      <div className="marker-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-graffiti text-xl text-[#1A1A1A]">Lineup Order</h3>
          <button
            onClick={saveRoster}
            disabled={saving || loading}
            className="sticker-btn-green flex items-center gap-2 text-sm py-2 px-3 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saved ? "Locked" : "Save Lineup"}
          </button>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-[#1A1A1A]/60 font-body py-6 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading lineup…
          </div>
        ) : roster.length === 0 ? (
          <p className="text-center text-[#1A1A1A]/50 font-body py-6">
            No crew members yet — put some players on first.
          </p>
        ) : (
          <div className="space-y-1.5">
            {roster.map((r, i) => (
              <div
                key={r.userEmail}
                className={`flex items-center gap-2 border-2 border-[#1A1A1A] px-2.5 py-2 ${
                  r.isActive ? "bg-white" : "bg-[#1A1A1A]/5 opacity-60"
                }`}
              >
                <span className="font-graffiti text-[#1A1A1A]/40 w-6 text-center">{i + 1}</span>
                <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={r.isActive}
                    onChange={() => toggleActive(r.userEmail)}
                    className="w-4 h-4 accent-[#FF5A00]"
                  />
                  <span className="font-marker text-[#1A1A1A] truncate">{r.displayName}</span>
                </label>
                <div className="flex gap-1">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="border-2 border-[#1A1A1A] bg-white p-1 disabled:opacity-30 hover:bg-[#F2EFE9]"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === roster.length - 1}
                    className="border-2 border-[#1A1A1A] bg-white p-1 disabled:opacity-30 hover:bg-[#F2EFE9]"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            <p className="text-xs text-[#1A1A1A]/50 font-body pt-1">
              {activeCount} player{activeCount === 1 ? "" : "s"} in the rotation. Unchecked players
              sit out.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
