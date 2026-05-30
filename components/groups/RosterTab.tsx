"use client";

import { useState, useEffect, useCallback } from "react";
import { Group } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowUp, ArrowDown, Save, Shuffle, Eye } from "lucide-react";

const TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, "0");
  const m = String((i % 4) * 15).padStart(2, "0");
  return `${h}:${m}`;
});

const DAYS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

interface RosterRow {
  userEmail: string;
  displayName: string;
  isActive: boolean;
}

interface MemberRow {
  userEmail: string;
  displayName: string;
}

interface PreviewData {
  rosterSize: number;
  slide: number;
  fairness: { userEmail: string; count: number }[];
  events: { date: string; offset: number; assignedEmails: string[] }[];
}

interface RosterTabProps {
  groupId: string;
  group: Group;
  members: MemberRow[];
  onEventsCreated: () => void;
}

/** Expand a [start, end] date range into all dates falling on `weekday` (0-6). */
function datesForWeekday(start: string, end: string, weekday: number): string[] {
  if (!start || !end) return [];
  const out: string[] = [];
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  const d = new Date(s);
  // Advance to the first matching weekday.
  while (d.getDay() !== weekday && d <= e) d.setDate(d.getDate() + 1);
  while (d <= e) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 7);
  }
  return out;
}

export default function RosterTab({ groupId, group, members, onEventsCreated }: RosterTabProps) {
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generator state
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("4");
  const [startTime, setStartTime] = useState("19:00");
  const [endTime, setEndTime] = useState("21:00");
  const [spots, setSpots] = useState(String(group.defaultEventSpots));
  const [slide, setSlide] = useState(String(group.roundRobinSlide));
  const [startOffset, setStartOffset] = useState("0");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [generating, setGenerating] = useState(false);

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

  const buildEvents = () =>
    datesForWeekday(startDate, endDate, parseInt(dayOfWeek)).map((date) => ({
      date,
      startTime,
      endTime,
      totalSpots: parseInt(spots) || group.defaultEventSpots,
    }));

  const runGenerator = async (asPreview: boolean) => {
    setError(null);
    const events = buildEvents();
    if (events.length === 0) {
      setError("Pick a date range that includes at least one matching day.");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/events/round-robin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events,
          slide: parseInt(slide) || 1,
          startOffset: parseInt(startOffset) || 0,
          preview: asPreview,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Round-robin failed");
        return;
      }
      if (asPreview) {
        setPreview(data.data);
      } else {
        setPreview(null);
        onEventsCreated();
      }
    } catch {
      setError("Round-robin failed");
    } finally {
      setGenerating(false);
    }
  };

  const nameFor = (email: string) =>
    roster.find((r) => r.userEmail === email)?.displayName ||
    members.find((m) => m.userEmail === email)?.displayName ||
    email.split("@")[0];

  const activeCount = roster.filter((r) => r.isActive).length;

  return (
    <div className="space-y-4">
      {/* How it works */}
      <div className="marker-card p-4 bg-[#FFD700]/15">
        <h3 className="font-graffiti text-xl text-[#1A1A1A] mb-1">The Rotation</h3>
        <p className="text-sm text-[#1A1A1A]/70 font-body">
          Got more writers than spots? Set the lineup order below, then drop a whole series of
          games. The crew slides down the list each game so everyone gets their reps — game 1 takes
          the players from the top, the next game slides down by your slide amount, and it wraps
          back around. Assigned spots cost credit just like any other.
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

      {/* Generator */}
      <div className="marker-card p-4 space-y-3">
        <h3 className="font-graffiti text-xl text-[#1A1A1A]">Run the Series</h3>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="font-graffiti text-[#1A1A1A]">From</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="sketch-input" />
          </div>
          <div className="space-y-1">
            <Label className="font-graffiti text-[#1A1A1A]">Until</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="sketch-input" />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="font-graffiti text-[#1A1A1A]">Day of week</Label>
          <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
            <SelectTrigger className="sketch-input"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DAYS.map((d) => (
                <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="font-graffiti text-[#1A1A1A]">Start</Label>
            <Select value={startTime} onValueChange={setStartTime}>
              <SelectTrigger className="sketch-input"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-60">
                {TIME_OPTIONS.map((t) => <SelectItem key={`s-${t}`} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="font-graffiti text-[#1A1A1A]">End</Label>
            <Select value={endTime} onValueChange={setEndTime}>
              <SelectTrigger className="sketch-input"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-60">
                {TIME_OPTIONS.map((t) => <SelectItem key={`e-${t}`} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="font-graffiti text-[#1A1A1A]">Spots</Label>
            <Input type="number" min="1" max="50" value={spots} onChange={(e) => setSpots(e.target.value)} className="sketch-input" />
          </div>
          <div className="space-y-1">
            <Label className="font-graffiti text-[#1A1A1A]">Slide</Label>
            <Input type="number" min="1" max="50" value={slide} onChange={(e) => setSlide(e.target.value)} className="sketch-input" />
          </div>
          <div className="space-y-1">
            <Label className="font-graffiti text-[#1A1A1A]">Start at #</Label>
            <Input type="number" min="0" value={startOffset} onChange={(e) => setStartOffset(e.target.value)} className="sketch-input" />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => runGenerator(true)}
            disabled={generating}
            className="sticker-btn-outline flex items-center justify-center gap-2 flex-1 text-sm py-2 disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            Preview
          </button>
          <button
            onClick={() => runGenerator(false)}
            disabled={generating || !preview}
            title={!preview ? "Preview first to check the fairness split" : undefined}
            className="sticker-btn flex items-center justify-center gap-2 flex-1 text-sm py-2 disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuffle className="w-4 h-4" />}
            Drop the Series
          </button>
        </div>

        {/* Preview output */}
        {preview && (
          <div className="space-y-3 border-t-2 border-[#1A1A1A]/20 pt-3">
            <div>
              <h4 className="font-graffiti text-[#1A1A1A]">Fair Split ({preview.events.length} games)</h4>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {preview.fairness
                  .slice()
                  .sort((a, b) => b.count - a.count)
                  .map((f) => (
                    <span key={f.userEmail} className="badge-blue text-[10px]">
                      {nameFor(f.userEmail)}: {f.count}
                    </span>
                  ))}
              </div>
            </div>
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {preview.events.map((ev) => (
                <div key={ev.date} className="border-2 border-[#1A1A1A]/20 p-2">
                  <p className="font-graffiti text-sm text-[#1A1A1A]">
                    {new Date(`${ev.date}T00:00:00`).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                  <p className="text-xs text-[#1A1A1A]/60 font-body">
                    {ev.assignedEmails.map((e) => nameFor(e)).join(", ")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
