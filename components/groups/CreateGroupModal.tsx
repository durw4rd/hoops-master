"use client";

import { useState } from "react";
import { Group } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Lock, Globe, Loader2 } from "lucide-react";
import BannerUploadField from "./BannerUploadField";
import { GraffitiDialog, GraffitiErrorBox } from "@/components/ui/GraffitiDialog";

interface CreateGroupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGroupCreated: (group: Group) => void;
}

export default function CreateGroupModal({ open, onOpenChange, onGroupCreated }: CreateGroupModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [bannerUrl, setBannerUrl] = useState<string | undefined>(undefined);
  const [bannerOrientation, setBannerOrientation] = useState<"landscape" | "portrait">("landscape");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [defaultSpots, setDefaultSpots] = useState("10");
  const [defaultCost, setDefaultCost] = useState("0");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Prague"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          bannerUrl,
          bannerOrientation,
          visibility,
          defaultEventSpots: parseInt(defaultSpots) || 10,
          defaultSlotCost: parseFloat(defaultCost) || 0,
          timezone,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create group");
        return;
      }

      setName("");
      setDescription("");
      setBannerUrl(undefined);
      setBannerOrientation("landscape");
      setVisibility("private");
      setDefaultSpots("10");
      setDefaultCost("0");

      onGroupCreated(data.data);
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <GraffitiDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create New Crew"
      description="Set up a new crew for your games"
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 mt-2">
        <div className="space-y-2">
          <Label htmlFor="name" className="font-graffiti text-asphalt">
            Crew Name
          </Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Thursday Ballers"
            className="sketch-input"
            maxLength={40}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description" className="font-graffiti text-asphalt">
            Description
          </Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Weekly basketball sessions at the local court"
            className="sketch-input resize-none"
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label className="font-graffiti text-asphalt">Crew Banner</Label>
          <BannerUploadField
            value={bannerUrl}
            onChange={setBannerUrl}
            orientation={bannerOrientation}
            onOrientationChange={setBannerOrientation}
          />
        </div>

        <div className="space-y-2">
          <Label className="font-graffiti text-asphalt">Visibility</Label>
          <div className="space-y-2">
            <div
              onClick={() => setVisibility("private")}
              className={`flex items-center space-x-3 p-3 border-2 border-asphalt cursor-pointer transition-all ${visibility === "private" ? "bg-asphalt text-sticker-white" : "bg-sticker-white hover:bg-concrete"}`}
            >
              <div
                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${visibility === "private" ? "border-sticker-white" : "border-asphalt"}`}
              >
                {visibility === "private" && <div className="w-2 h-2 rounded-full bg-current" />}
              </div>
              <Lock className="w-4 h-4" />
              <div className="flex-1">
                <span className="font-graffiti">Private</span>
                <p
                  className={`text-xs font-body ${visibility === "private" ? "text-sticker-white/60" : "text-asphalt/60"}`}
                >
                  Members join via invite code only
                </p>
              </div>
            </div>
            <div
              onClick={() => setVisibility("public")}
              className={`flex items-center space-x-3 p-3 border-2 border-asphalt cursor-pointer transition-all ${visibility === "public" ? "bg-moss-green" : "bg-sticker-white hover:bg-concrete"}`}
            >
              <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center border-asphalt">
                {visibility === "public" && <div className="w-2 h-2 rounded-full bg-asphalt" />}
              </div>
              <Globe className="w-4 h-4" />
              <div className="flex-1">
                <span className="font-graffiti">Public</span>
                <p
                  className={`text-xs font-body ${visibility === "public" ? "text-asphalt/70" : "text-asphalt/60"}`}
                >
                  Anyone can find and join
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="spots" className="font-graffiti text-asphalt">
              Default Spots
            </Label>
            <Input
              id="spots"
              type="number"
              min="1"
              max="50"
              value={defaultSpots}
              onChange={(e) => setDefaultSpots(e.target.value)}
              className="sketch-input"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cost" className="font-graffiti text-asphalt">
              Default Cost
            </Label>
            <Input
              id="cost"
              type="number"
              min="0"
              step="0.01"
              value={defaultCost}
              onChange={(e) => setDefaultCost(e.target.value)}
              className="sketch-input"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="timezone" className="font-graffiti text-asphalt">
            Timezone
          </Label>
          <Input
            id="timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="Europe/Prague"
            className="sketch-input text-sm"
          />
          <p className="text-xs text-asphalt/40 font-body">
            IANA timezone used for all event dates &amp; times
          </p>
        </div>

        {error && <GraffitiErrorBox>{error}</GraffitiErrorBox>}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => onOpenChange(false)} className="sticker-btn-outline">
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="sticker-btn disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                Creating...
              </>
            ) : (
              "Create Crew"
            )}
          </button>
        </div>
      </form>
    </GraffitiDialog>
  );
}
