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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import BannerUploadField from "./BannerUploadField";
import type { EventType, BannerOrientation, PricingMode } from "@/lib/types";
import PricingFields from "./PricingFields";

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
  pricingMode?: PricingMode;
  totalCost?: number;
  pricingFinalizedAt?: string | null;
  occupancy?: number;
  location: string;
  name: string;
  description: string;
  eventType?: EventType;
  bannerUrl?: string | null;
  bannerOrientation?: BannerOrientation;
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
  const [pricingMode, setPricingMode] = useState<PricingMode>(event.pricingMode ?? "per_spot");
  const [totalCost, setTotalCost] = useState(String(event.totalCost ?? 0));
  const [location, setLocation] = useState(event.location);
  const [name, setName] = useState(event.name);
  const [description, setDescription] = useState(event.description);
  const [eventType, setEventType] = useState<EventType>(event.eventType ?? "regular");
  const [bannerUrl, setBannerUrl] = useState<string | undefined>(event.bannerUrl ?? undefined);
  const [bannerOrientation, setBannerOrientation] = useState<BannerOrientation>(
    event.bannerOrientation ?? "landscape"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDate(event.date);
      setStartTime(event.startTime);
      setEndTime(event.endTime);
      setTotalSpots(String(event.totalSpots));
      setSlotCost(String(event.slotCost));
      setPricingMode(event.pricingMode ?? "per_spot");
      setTotalCost(String(event.totalCost ?? 0));
      setLocation(event.location);
      setName(event.name);
      setDescription(event.description);
      setEventType(event.eventType ?? "regular");
      setBannerUrl(event.bannerUrl ?? undefined);
      setBannerOrientation(event.bannerOrientation ?? "landscape");
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
          pricingMode,
          slotCost: pricingMode === "per_spot" ? parseFloat(slotCost) || 0 : 0,
          totalCost: pricingMode === "split_total" ? parseFloat(totalCost) || 0 : 0,
          location,
          name: eventType === "special" ? name : "",
          description,
          eventType,
          bannerUrl: eventType === "special" ? (bannerUrl ?? null) : null,
          bannerOrientation: eventType === "special" ? bannerOrientation : "landscape",
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
      <DialogContent className="graffiti-dialog max-w-md mx-2 sm:mx-auto rounded-none max-h-[85vh] overflow-y-auto shadow-sticker-lg">
        <DialogHeader>
          <DialogTitle className="graffiti-dialog-title">Edit Game</DialogTitle>
          <DialogDescription className="text-asphalt/60 font-body">
            Update the game&apos;s details
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-3 mt-4">
          <div className="space-y-2">
            <Label htmlFor="edit-date" className="font-graffiti text-asphalt">Date</Label>
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
              <Label className="font-graffiti text-asphalt">Start</Label>
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
              <Label className="font-graffiti text-asphalt">End</Label>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-spots" className="font-graffiti text-asphalt">Spots</Label>
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
            <div>
              <PricingFields
                idPrefix="edit"
                pricingMode={pricingMode}
                onPricingModeChange={setPricingMode}
                slotCost={slotCost}
                onSlotCostChange={setSlotCost}
                totalCost={totalCost}
                onTotalCostChange={setTotalCost}
                disabled={!!event.pricingFinalizedAt}
              />
              {pricingMode === "per_spot" &&
                parseFloat(slotCost) !== event.slotCost && (
                  <p className="text-xs text-terracotta font-body mt-2">
                    Saving will adjust player balances for anyone already on the roster.
                  </p>
                )}
              {pricingMode === "split_total" &&
                event.pricingMode === "per_spot" &&
                !event.pricingFinalizedAt &&
                (event.occupancy ?? 0) > 0 && (
                  <p className="text-xs text-terracotta font-body mt-2">
                    Saving will credit back per-spot charges for players currently on the roster.
                  </p>
                )}

            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-location" className="font-graffiti text-asphalt">Location</Label>
            <Input
              id="edit-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., The Court"
              className="sketch-input"
            />
          </div>

          <div className="space-y-2">
            <Label className="font-graffiti text-asphalt">Game Type</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEventType("regular")}
                className={`flex-1 px-3 py-2 border-2 border-asphalt font-graffiti text-sm transition-colors ${
                  eventType === "regular"
                    ? "bg-slate-blue text-white"
                    : "bg-white text-asphalt hover:bg-sticker-white"
                }`}
              >
                Regular
              </button>
              <button
                type="button"
                onClick={() => setEventType("special")}
                className={`flex-1 px-3 py-2 border-2 border-asphalt font-graffiti text-sm transition-colors ${
                  eventType === "special"
                    ? "bg-terracotta text-white"
                    : "bg-white text-asphalt hover:bg-sticker-white"
                }`}
              >
                Special
              </button>
            </div>
          </div>

          {eventType === "special" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="edit-name" className="font-graffiti text-asphalt">Name</Label>
                <Input
                  id="edit-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Summer Showcase"
                  className="sketch-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description" className="font-graffiti text-asphalt">Description</Label>
                <Textarea
                  id="edit-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What's the vibe?"
                  className="sketch-input min-h-[80px]"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-graffiti text-asphalt">Banner</Label>
                <BannerUploadField
                  value={bannerUrl}
                  onChange={setBannerUrl}
                  orientation={bannerOrientation}
                  onOrientationChange={setBannerOrientation}
                  uploadUrl={`/api/groups/${groupId}/events/banner`}
                />
              </div>
            </>
          )}

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
