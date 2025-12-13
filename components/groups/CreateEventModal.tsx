"use client";

import { useState } from "react";
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
import { Calendar, Repeat, Loader2 } from "lucide-react";

interface CreateEventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  defaultSpots: number;
  onEventCreated: () => void;
}

const DAYS_OF_WEEK = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

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
  onEventCreated,
}: CreateEventModalProps) {
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("19:00");
  const [endTime, setEndTime] = useState("21:00");
  const [totalSpots, setTotalSpots] = useState(String(defaultSpots));
  const [slotCost, setSlotCost] = useState("0");
  const [location, setLocation] = useState("");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("4");

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

  const handleCreateRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/groups/${groupId}/events/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          dayOfWeek: parseInt(dayOfWeek),
          startTime,
          endTime,
          totalSpots: parseInt(totalSpots) || defaultSpots,
          slotCost: parseFloat(slotCost) || 0,
          location: location || undefined,
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
    setSlotCost("0");
    setLocation("");
    setSignupOpenType("immediate");
    setSignupDaysBefore(7);
    setSignupAbsoluteDate("");
    setSignupAbsoluteTime("09:00");
    setError(null);
  };

  const SignupTimingSection = () => (
    <div className="space-y-3 border-t-2 border-[#1A1A1A]/20 pt-3 mt-3">
      <Label className="font-graffiti text-[#1A1A1A]">Signup Opens</Label>
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
            <span className="text-sm text-[#1A1A1A]/60 font-body">days before event</span>
          </div>
          <p className="text-xs text-[#1A1A1A]/40 font-body">Opens at event start time</p>
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
      <DialogContent className="bg-[#F2EFE9] border-4 border-[#1A1A1A] max-w-md mx-2 sm:mx-auto rounded-none max-h-[85vh] overflow-y-auto shadow-[8px_8px_0_#1A1A1A]">
        <DialogHeader>
          <DialogTitle className="font-graffiti text-2xl text-[#FF5A00]">Create Game</DialogTitle>
          <DialogDescription className="text-[#1A1A1A]/60 font-body">
            Add a single game or create a recurring series
          </DialogDescription>
        </DialogHeader>

        {/* Tab Buttons */}
        <div className="flex gap-2 bg-[#1A1A1A] p-1 mt-2">
          <button
            type="button"
            onClick={() => setActiveTab('single')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 font-graffiti text-sm transition-all ${
              activeTab === 'single' 
                ? 'bg-[#FF5A00] text-white' 
                : 'text-[#F2EFE9]/60 hover:text-[#F2EFE9]'
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
                ? 'bg-[#0084FF] text-white' 
                : 'text-[#F2EFE9]/60 hover:text-[#F2EFE9]'
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
              <Label htmlFor="date" className="font-graffiti text-[#1A1A1A]">Date</Label>
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
                <Label className="font-graffiti text-[#1A1A1A]">Start</Label>
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
                <Label className="font-graffiti text-[#1A1A1A]">End</Label>
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
                <Label htmlFor="spots" className="font-graffiti text-[#1A1A1A]">Spots</Label>
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
                <Label htmlFor="cost" className="font-graffiti text-[#1A1A1A]">Cost</Label>
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
              <Label htmlFor="location" className="font-graffiti text-[#1A1A1A]">Location</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., The Court"
                className="sketch-input"
              />
            </div>

            <SignupTimingSection />

            {error && (
              <div className="p-2 bg-[#FF5A00]/10 border-2 border-[#FF5A00]">
                <p className="text-sm text-[#FF5A00] font-body">{error}</p>
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
                  Creating...
                </>
              ) : (
                "Create Game"
              )}
            </button>
          </form>
        )}

        {/* Recurring Event Form */}
        {activeTab === 'recurring' && (
          <form onSubmit={handleCreateRecurring} className="space-y-3 mt-4">
            <div className="space-y-2">
              <Label htmlFor="dayOfWeek" className="font-graffiti text-[#1A1A1A]">Day of Week</Label>
              <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                <SelectTrigger className="sketch-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map((day) => (
                    <SelectItem key={day.value} value={day.value}>
                      {day.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="startDate" className="font-graffiti text-[#1A1A1A]">From</Label>
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
                <Label htmlFor="endDate" className="font-graffiti text-[#1A1A1A]">Until</Label>
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="font-graffiti text-[#1A1A1A]">Start</Label>
                <Select value={startTime} onValueChange={setStartTime}>
                  <SelectTrigger className="sketch-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {TIME_OPTIONS.map((time) => (
                      <SelectItem key={`r-start-${time}`} value={time}>{time}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-graffiti text-[#1A1A1A]">End</Label>
                <Select value={endTime} onValueChange={setEndTime}>
                  <SelectTrigger className="sketch-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {TIME_OPTIONS.map((time) => (
                      <SelectItem key={`r-end-${time}`} value={time}>{time}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="rSpots" className="font-graffiti text-[#1A1A1A]">Spots</Label>
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
                <Label htmlFor="rCost" className="font-graffiti text-[#1A1A1A]">Cost</Label>
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
              <Label htmlFor="rLocation" className="font-graffiti text-[#1A1A1A]">Location</Label>
              <Input
                id="rLocation"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., The Court"
                className="sketch-input"
              />
            </div>

            <SignupTimingSection />

            {error && (
              <div className="p-2 bg-[#FF5A00]/10 border-2 border-[#FF5A00]">
                <p className="text-sm text-[#FF5A00] font-body">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !startDate || !endDate}
              className="sticker-btn-blue w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                  Creating...
                </>
              ) : (
                "Create Recurring Games"
              )}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
