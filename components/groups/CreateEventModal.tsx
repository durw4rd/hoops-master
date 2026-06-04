"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Repeat, Loader2, Shuffle, Eye } from "lucide-react";
import WeeklyScheduleBuilder from "./WeeklyScheduleBuilder";
import LineupEditor from "./LineupEditor";
import { expandWeeklySchedule, type ScheduleSlot } from "@/lib/schedule";

type AssignmentMode = "player_signup" | "admin_assign" | "round_robin";

interface RotationPreview {
  rosterSize: number;
  slide: number;
  fairness: { userEmail: string; count: number }[];
  events: { date: string; startTime: string; endTime: string; offset: number; assignedEmails: string[] }[];
}

interface CreateEventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  defaultSpots: number;
  defaultCost: number;
  /** Used to show display names in the rotation preview. */
  members?: { userEmail: string; displayName: string }[];
  roundRobinSlide?: number;
  onEventCreated: () => void;
}

const TIME_OPTIONS = [
  "00:00", "00:15", "00:30", "00:45",
  "01:00", "01:15", "01:30", "01:45",
  "02:00", "02:15", "02:30", "02:45",
  "03:00", "03:15", "03:30", "03:45",
  "04:00", "04:15", "04:30", "04:45",
  "05:00", "05:15", "05:30", "05:45",
  "06:00", "06:15", "06:30", "06:45",
  "07:00", "07:15", "07:30", "07:45",
  "08:00", "08:15", "08:30", "08:45",
  "09:00", "09:15", "09:30", "09:45",
  "10:00", "10:15", "10:30", "10:45",
  "11:00", "11:15", "11:30", "11:45",
  "12:00", "12:15", "12:30", "12:45",
  "13:00", "13:15", "13:30", "13:45",
  "14:00", "14:15", "14:30", "14:45",
  "15:00", "15:15", "15:30", "15:45",
  "16:00", "16:15", "16:30", "16:45",
  "17:00", "17:15", "17:30", "17:45",
  "18:00", "18:15", "18:30", "18:45",
  "19:00", "19:15", "19:30", "19:45",
  "20:00", "20:15", "20:30", "20:45",
  "21:00", "21:15", "21:30", "21:45",
  "22:00", "22:15", "22:30", "22:45",
  "23:00", "23:15", "23:30", "23:45",
];

export default function CreateEventModal({
  open,
  onOpenChange,
  groupId,
  defaultSpots,
  defaultCost,
  members = [],
  roundRobinSlide = 1,
  onEventCreated,
}: CreateEventModalProps) {
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("19:00");
  const [endTime, setEndTime] = useState("21:00");
  const [totalSpots, setTotalSpots] = useState(String(defaultSpots));
  const [slotCost, setSlotCost] = useState(String(defaultCost));
  const [location, setLocation] = useState("");
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>("player_signup");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Round-robin (Rotation) controls — only used when assignmentMode === 'round_robin'.
  const [slide, setSlide] = useState(String(roundRobinSlide));
  const [startOffset, setStartOffset] = useState("0");
  const [rotationPreview, setRotationPreview] = useState<RotationPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // Recurring schedule: one or more weekly slots, optionally split into blocks.
  const [slots, setSlots] = useState<ScheduleSlot[]>([
    { dayOfWeek: 1, startTime: "18:00", endTime: "20:00" },
  ]);
  const [blockMinutes, setBlockMinutes] = useState(0);

  // Signup timing
  const [signupOpenType, setSignupOpenType] = useState<"immediate" | "relative" | "absolute">("immediate");
  const [signupDaysBefore, setSignupDaysBefore] = useState(7);
  const [signupAbsoluteDate, setSignupAbsoluteDate] = useState("");
  const [signupAbsoluteTime, setSignupAbsoluteTime] = useState("09:00");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'single' | 'recurring'>('single');

  const getSignupPayload = () => {
    if (signupOpenType === "immediate") {
      return { signupOpenType: "immediate" };
    }
    if (signupOpenType === "relative") {
      return { signupOpenType: "relative", signupOpenValue: signupDaysBefore };
    }
    if (signupOpenType === "absolute" && signupAbsoluteDate) {
      const dateTime = `${signupAbsoluteDate}T${signupAbsoluteTime}:00`;
      return { signupOpenType: "absolute", signupOpenValue: dateTime };
    }
    return { signupOpenType: "immediate" };
  };

  const handleCreateSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/groups/${groupId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          startTime,
          endTime,
          totalSpots: parseInt(totalSpots) || defaultSpots,
          slotCost: parseFloat(slotCost) || 0,
          location: location || undefined,
          assignmentMode,
          ...getSignupPayload(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create event");
        return;
      }

      resetForm();
      onEventCreated();
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Block list shared by bulk + round-robin recurring creation.
  const buildRotationEvents = () =>
    expandWeeklySchedule(slots, blockMinutes, startDate, endDate).map((b) => ({
      date: b.date,
      startTime: b.startTime,
      endTime: b.endTime,
      totalSpots: parseInt(totalSpots) || defaultSpots,
      slotCost: parseFloat(slotCost) || 0,
      location: location || undefined,
    }));

  const nameFor = (email: string) =>
    members.find((m) => m.userEmail === email)?.displayName || email.split("@")[0];

  // Any change to the schedule/rotation knobs invalidates a prior preview.
  useEffect(() => {
    setRotationPreview(null);
  }, [slots, blockMinutes, startDate, endDate, slide, startOffset, totalSpots, assignmentMode]);

  const runRotationPreview = async () => {
    setError(null);
    const events = buildRotationEvents();
    if (events.length === 0) {
      setError("No games in that range — check your slots and dates.");
      return;
    }
    setPreviewing(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/events/round-robin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events,
          slide: parseInt(slide) || 1,
          startOffset: parseInt(startOffset) || 0,
          preview: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't preview the rotation");
        return;
      }
      setRotationPreview(data.data);
    } catch {
      setError("Couldn't preview the rotation");
    } finally {
      setPreviewing(false);
    }
  };

  const handleCreateRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const blocks = expandWeeklySchedule(slots, blockMinutes, startDate, endDate);
    if (blocks.length === 0) {
      setError("No games in that range — check your slots and dates.");
      return;
    }

    setLoading(true);
    try {
      if (assignmentMode === "round_robin") {
        const res = await fetch(`/api/groups/${groupId}/events/round-robin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            events: buildRotationEvents(),
            slide: parseInt(slide) || 1,
            startOffset: parseInt(startOffset) || 0,
            preview: false,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to create the rotation");
          return;
        }
        resetForm();
        onEventCreated();
        return;
      }

      const res = await fetch(`/api/groups/${groupId}/events/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events: blocks,
          totalSpots: parseInt(totalSpots) || defaultSpots,
          slotCost: parseFloat(slotCost) || 0,
          location: location || undefined,
          assignmentMode,
          ...getSignupPayload(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create events");
        return;
      }

      resetForm();
      onEventCreated();
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setDate("");
    setStartDate("");
    setEndDate("");
    setStartTime("19:00");
    setEndTime("21:00");
    setTotalSpots(String(defaultSpots));
    setSlotCost(String(defaultCost));
    setLocation("");
    setSlots([{ dayOfWeek: 1, startTime: "18:00", endTime: "20:00" }]);
    setBlockMinutes(0);
    setAssignmentMode("player_signup");
    setSlide(String(roundRobinSlide));
    setStartOffset("0");
    setRotationPreview(null);
    setSignupOpenType("immediate");
    setSignupDaysBefore(7);
    setSignupAbsoluteDate("");
    setSignupAbsoluteTime("09:00");
    setError(null);
  };

  const renderAssignmentMode = (allowRoundRobin: boolean) => (
    <div className="space-y-2">
      <Label className="font-graffiti text-asphalt">Assignment Mode</Label>
      <Select value={assignmentMode} onValueChange={(v) => setAssignmentMode(v as AssignmentMode)}>
        <SelectTrigger className="sketch-input">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="player_signup">Players sign up</SelectItem>
          <SelectItem value="admin_assign">Admin assigns players</SelectItem>
          {allowRoundRobin && <SelectItem value="round_robin">Rotation (sliding squads)</SelectItem>}
        </SelectContent>
      </Select>
      {!allowRoundRobin && (
        <p className="text-xs text-asphalt/40 font-body">
          Rotation (sliding squads) runs across a series — use the Recurring tab for that.
        </p>
      )}
    </div>
  );

  const renderSignupTiming = () => (
    <div className="space-y-3 border-t-2 border-asphalt/20 pt-3 mt-3">
      <Label className="font-graffiti text-asphalt">Signup Opens</Label>
      <Select value={signupOpenType} onValueChange={(v) => setSignupOpenType(v as any)}>
        <SelectTrigger className="sketch-input">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="immediate">Immediately</SelectItem>
          <SelectItem value="relative">Days before event</SelectItem>
          <SelectItem value="absolute">Specific date & time</SelectItem>
        </SelectContent>
      </Select>

      {signupOpenType === "relative" && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="1"
              max="365"
              value={signupDaysBefore}
              onChange={(e) => setSignupDaysBefore(parseInt(e.target.value) || 1)}
              className="sketch-input w-20"
            />
            <span className="text-sm text-asphalt/60 font-body">days before event</span>
          </div>
          <p className="text-xs text-asphalt/40 font-body">Opens at event start time</p>
        </div>
      )}

      {signupOpenType === "absolute" && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="date"
            value={signupAbsoluteDate}
            onChange={(e) => setSignupAbsoluteDate(e.target.value)}
            className="sketch-input"
          />
          <Input
            type="time"
            value={signupAbsoluteTime}
            onChange={(e) => setSignupAbsoluteTime(e.target.value)}
            className="sketch-input"
          />
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="graffiti-dialog max-w-md mx-2 sm:mx-auto rounded-none max-h-[85vh] overflow-y-auto shadow-sticker-lg">
        <DialogHeader>
          <DialogTitle className="graffiti-dialog-title">Drop a Game</DialogTitle>
          <DialogDescription className="text-asphalt/60 font-body">
            Set up a one-off run or lock in a whole season
          </DialogDescription>
        </DialogHeader>

        {/* Tab Buttons */}
        <div className="flex gap-2 bg-asphalt p-1 mt-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('single');
              // Rotation only applies to a series; drop it when moving to a single game.
              if (assignmentMode === 'round_robin') setAssignmentMode('player_signup');
            }}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 font-graffiti text-sm transition-all ${
              activeTab === 'single' 
                ? 'bg-terracotta text-white' 
                : 'text-sticker-white/60 hover:text-sticker-white'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Single
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('recurring')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 font-graffiti text-sm transition-all ${
              activeTab === 'recurring' 
                ? 'bg-slate-blue text-white' 
                : 'text-sticker-white/60 hover:text-sticker-white'
            }`}
          >
            <Repeat className="w-4 h-4" />
            Recurring
          </button>
        </div>

        {/* Single Event Form */}
        {activeTab === 'single' && (
          <form onSubmit={handleCreateSingle} className="space-y-3 mt-4">
            <div className="space-y-2">
              <Label htmlFor="date" className="font-graffiti text-asphalt">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="sketch-input"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="font-graffiti text-asphalt">Start</Label>
                <Select value={startTime} onValueChange={setStartTime}>
                  <SelectTrigger className="sketch-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {TIME_OPTIONS.map((time) => (
                      <SelectItem key={time} value={time}>{time}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-graffiti text-asphalt">End</Label>
                <Select value={endTime} onValueChange={setEndTime}>
                  <SelectTrigger className="sketch-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {TIME_OPTIONS.map((time) => (
                      <SelectItem key={time} value={time}>{time}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="spots" className="font-graffiti text-asphalt">Spots</Label>
                <Input
                  id="spots"
                  type="number"
                  min="1"
                  max="50"
                  value={totalSpots}
                  onChange={(e) => setTotalSpots(e.target.value)}
                  className="sketch-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cost" className="font-graffiti text-asphalt">Cost (€)</Label>
                <Input
                  id="cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={slotCost}
                  onChange={(e) => setSlotCost(e.target.value)}
                  className="sketch-input"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location" className="font-graffiti text-asphalt">Location</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., The Court"
                className="sketch-input"
              />
            </div>

            {renderAssignmentMode(false)}

            {assignmentMode === "player_signup" && renderSignupTiming()}

            {error && (
              <div className="p-2 bg-terracotta/10 border-2 border-terracotta">
                <p className="text-sm text-terracotta font-body">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !date}
              className="sticker-btn w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                  Dropping...
                </>
              ) : (
                "Drop It"
              )}
            </button>
          </form>
        )}

        {/* Recurring Event Form */}
        {activeTab === 'recurring' && (
          <form onSubmit={handleCreateRecurring} className="space-y-3 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="startDate" className="font-graffiti text-asphalt">From</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="sketch-input"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate" className="font-graffiti text-asphalt">Until</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="sketch-input"
                  required
                />
              </div>
            </div>

            <WeeklyScheduleBuilder
              slots={slots}
              onSlotsChange={setSlots}
              blockMinutes={blockMinutes}
              onBlockMinutesChange={setBlockMinutes}
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="rSpots" className="font-graffiti text-asphalt">Spots</Label>
                <Input
                  id="rSpots"
                  type="number"
                  min="1"
                  max="50"
                  value={totalSpots}
                  onChange={(e) => setTotalSpots(e.target.value)}
                  className="sketch-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rCost" className="font-graffiti text-asphalt">Cost (€)</Label>
                <Input
                  id="rCost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={slotCost}
                  onChange={(e) => setSlotCost(e.target.value)}
                  className="sketch-input"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rLocation" className="font-graffiti text-asphalt">Location</Label>
              <Input
                id="rLocation"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., The Court"
                className="sketch-input"
              />
            </div>

            {renderAssignmentMode(true)}

            {assignmentMode === "player_signup" && renderSignupTiming()}

            {/* Rotation (round-robin) controls + fairness preview */}
            {assignmentMode === "round_robin" && (
              <div className="space-y-3 border-t-2 border-asphalt/20 pt-3 mt-3">
                <p className="text-xs text-asphalt/60 font-body">
                  Squads slide down the lineup below so everyone gets fair reps. Reorder players and
                  uncheck anyone sitting out, then <span className="font-graffiti">Save Lineup</span>.
                  Assigned spots cost credit like any other.
                </p>

                <div className="border-2 border-asphalt/20 p-3">
                  <LineupEditor
                    groupId={groupId}
                    members={members}
                    onLineupSaved={() => setRotationPreview(null)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="font-graffiti text-asphalt">Slide</Label>
                    <Input
                      type="number"
                      min="1"
                      max="50"
                      value={slide}
                      onChange={(e) => setSlide(e.target.value)}
                      className="sketch-input"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="font-graffiti text-asphalt">Start at #</Label>
                    <Input
                      type="number"
                      min="0"
                      value={startOffset}
                      onChange={(e) => setStartOffset(e.target.value)}
                      className="sketch-input"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={runRotationPreview}
                  disabled={previewing || !startDate || !endDate}
                  className="sticker-btn-outline w-full flex items-center justify-center gap-2 text-sm py-2 disabled:opacity-50"
                >
                  {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                  Preview the Split
                </button>

                {rotationPreview && (
                  <div className="space-y-3 border-t-2 border-asphalt/10 pt-3">
                    <div>
                      <h4 className="font-graffiti text-asphalt">
                        Fair Split ({rotationPreview.events.length} games · {rotationPreview.rosterSize} in rotation)
                      </h4>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {rotationPreview.fairness
                          .slice()
                          .sort((a, b) => b.count - a.count)
                          .map((f) => (
                            <span key={f.userEmail} className="badge-blue text-[10px]">
                              {nameFor(f.userEmail)}: {f.count}
                            </span>
                          ))}
                      </div>
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {rotationPreview.events.map((ev, i) => (
                        <div key={`${ev.date}-${ev.startTime}-${i}`} className="border-2 border-asphalt/20 p-2">
                          <p className="font-graffiti text-sm text-asphalt">
                            {new Date(`${ev.date}T00:00:00`).toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}
                            <span className="text-asphalt/50 ml-1.5">
                              {ev.startTime}–{ev.endTime}
                            </span>
                          </p>
                          <p className="text-xs text-asphalt/60 font-body">
                            {ev.assignedEmails.map((em) => nameFor(em)).join(", ")}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="p-2 bg-terracotta/10 border-2 border-terracotta">
                <p className="text-sm text-terracotta font-body">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={
                loading ||
                !startDate ||
                !endDate ||
                (assignmentMode === "round_robin" && !rotationPreview)
              }
              title={
                assignmentMode === "round_robin" && !rotationPreview
                  ? "Preview the split first to check fairness"
                  : undefined
              }
              className={`w-full disabled:opacity-50 disabled:cursor-not-allowed ${
                assignmentMode === "round_robin" ? "sticker-btn" : "sticker-btn-blue"
              }`}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                  {assignmentMode === "round_robin" ? "Dropping the rotation..." : "Locking it in..."}
                </>
              ) : assignmentMode === "round_robin" ? (
                <>
                  <Shuffle className="w-4 h-4 mr-2 inline" />
                  Drop the Rotation
                </>
              ) : (
                "Lock the Season"
              )}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
