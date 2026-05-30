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
import { Loader2 } from "lucide-react";

const TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, "0");
  const m = String((i % 4) * 15).padStart(2, "0");
  return `${h}:${m}`;
});

interface EditableEvent {
  eventId: string;
  date: string;
  startTime: string;
  endTime: string;
  totalSpots: number;
  slotCost: number;
  location: string;
  description: string;
}

interface EditEventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  event: EditableEvent;
  onSaved: () => void;
}

export default function EditEventModal({
  open,
  onOpenChange,
  groupId,
  event,
  onSaved,
}: EditEventModalProps) {
  const [date, setDate] = useState(event.date);
  const [startTime, setStartTime] = useState(event.startTime);
  const [endTime, setEndTime] = useState(event.endTime);
  const [totalSpots, setTotalSpots] = useState(String(event.totalSpots));
  const [slotCost, setSlotCost] = useState(String(event.slotCost));
  const [location, setLocation] = useState(event.location);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync local state whenever a different event is opened.
  useEffect(() => {
    if (open) {
      setDate(event.date);
      setStartTime(event.startTime);
      setEndTime(event.endTime);
      setTotalSpots(String(event.totalSpots));
      setSlotCost(String(event.slotCost));
      setLocation(event.location);
      setError(null);
    }
  }, [open, event]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/events/${event.eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          startTime,
          endTime,
          totalSpots: parseInt(totalSpots) || event.totalSpots,
          slotCost: parseFloat(slotCost) || 0,
          location,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update game");
        return;
      }
      onSaved();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#F2EFE9] border-4 border-[#1A1A1A] max-w-md mx-2 sm:mx-auto rounded-none max-h-[85vh] overflow-y-auto shadow-[8px_8px_0_#1A1A1A]">
        <DialogHeader>
          <DialogTitle className="font-graffiti text-2xl text-[#FF5A00]">Edit Game</DialogTitle>
          <DialogDescription className="text-[#1A1A1A]/60 font-body">
            Update the game&apos;s details
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-3 mt-4">
          <div className="space-y-2">
            <Label htmlFor="edit-date" className="font-graffiti text-[#1A1A1A]">Date</Label>
            <Input
              id="edit-date"
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
                    <SelectItem key={`e-start-${time}`} value={time}>{time}</SelectItem>
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
                    <SelectItem key={`e-end-${time}`} value={time}>{time}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-spots" className="font-graffiti text-[#1A1A1A]">Spots</Label>
              <Input
                id="edit-spots"
                type="number"
                min="1"
                max="50"
                value={totalSpots}
                onChange={(e) => setTotalSpots(e.target.value)}
                className="sketch-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-cost" className="font-graffiti text-[#1A1A1A]">Cost (€)</Label>
              <Input
                id="edit-cost"
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
            <Label htmlFor="edit-location" className="font-graffiti text-[#1A1A1A]">Location</Label>
            <Input
              id="edit-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., The Court"
              className="sketch-input"
            />
          </div>

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
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
