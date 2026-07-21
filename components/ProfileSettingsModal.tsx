"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, SprayCan, ImagePlus, X } from "lucide-react";
import PlayerAvatar from "@/components/PlayerAvatar";

interface ProfileSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentDisplayName: string;
  currentPieceUrl?: string;
  currentEmailGameReminders?: boolean;
  currentEmailBenchPromotions?: boolean;
  onSaved: (displayName: string) => void;
}

export default function ProfileSettingsModal({
  open,
  onOpenChange,
  currentDisplayName,
  currentPieceUrl,
  currentEmailGameReminders = true,
  currentEmailBenchPromotions = true,
  onSaved,
}: ProfileSettingsModalProps) {
  const [tag, setTag] = useState(currentDisplayName);
  const [pieceUrl, setPieceUrl] = useState<string | undefined>(currentPieceUrl);
  const [emailGameReminders, setEmailGameReminders] = useState(currentEmailGameReminders);
  const [emailBenchPromotions, setEmailBenchPromotions] = useState(currentEmailBenchPromotions);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset the fields whenever the modal opens or the source values change.
  useEffect(() => {
    if (open) {
      setTag(currentDisplayName);
      setPieceUrl(currentPieceUrl);
      setEmailGameReminders(currentEmailGameReminders);
      setEmailBenchPromotions(currentEmailBenchPromotions);
      setError(null);
    }
  }, [open, currentDisplayName, currentPieceUrl, currentEmailGameReminders, currentEmailBenchPromotions]);

  const tagChanged = tag.trim() !== currentDisplayName;
  const pieceChanged = (pieceUrl ?? "") !== (currentPieceUrl ?? "");
  const emailPrefsChanged =
    emailGameReminders !== currentEmailGameReminders ||
    emailBenchPromotions !== currentEmailBenchPromotions;

  const handlePieceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/user/piece", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to upload your piece");
        return;
      }
      setPieceUrl(data.url);
    } catch {
      setError("Failed to upload your piece");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const payload: {
        displayName?: string;
        pieceUrl?: string | null;
        emailGameReminders?: boolean;
        emailBenchPromotions?: boolean;
      } = {};
      if (tagChanged) payload.displayName = tag;
      if (pieceChanged) payload.pieceUrl = pieceUrl ?? null;
      if (emailGameReminders !== currentEmailGameReminders) {
        payload.emailGameReminders = emailGameReminders;
      }
      if (emailBenchPromotions !== currentEmailBenchPromotions) {
        payload.emailBenchPromotions = emailBenchPromotions;
      }

      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to update your profile");
        return;
      }

      onSaved(data.data.displayName);
      onOpenChange(false);
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="graffiti-dialog max-w-md mx-2 sm:mx-auto rounded-none shadow-sticker-lg">
        <DialogHeader>
          <DialogTitle className="graffiti-dialog-title flex items-center gap-2">
            <SprayCan className="w-6 h-6" />
            Your Tag
          </DialogTitle>
          <DialogDescription className="text-asphalt/60 font-body">
            Rep your style — set the handle and piece the crew sees on the court.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label className="font-graffiti text-asphalt">Your Piece</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handlePieceFile}
            />
            <div className="flex items-center gap-3">
              <PlayerAvatar pieceUrl={pieceUrl} name={tag} className="h-16 w-16" />
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-asphalt bg-white text-asphalt text-xs font-graffiti hover:bg-sticker-white transition-colors disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ImagePlus className="w-4 h-4" />
                  )}
                  {pieceUrl ? "Switch It Up" : "Drop Your Piece"}
                </button>
                {pieceUrl && (
                  <button
                    type="button"
                    onClick={() => setPieceUrl(undefined)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-body text-asphalt/60 hover:text-terracotta transition-colors"
                  >
                    <X className="w-3.5 h-3.5" /> Buff it
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-asphalt/40 font-body">Your mugshot on the court. JPEG, PNG, WebP or GIF, up to 5MB.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tag" className="font-graffiti text-asphalt">
              Handle
            </Label>
            <Input
              id="tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="AirJordan23"
              className="sketch-input"
              minLength={2}
              maxLength={30}
              required
              autoFocus
            />
            <p className="text-xs text-asphalt/40 font-body">2-30 characters</p>
          </div>

          <div className="space-y-2">
            <Label className="font-graffiti text-asphalt">Mail Drops</Label>
            <div className="border-2 border-asphalt divide-y-2 divide-asphalt/20">
              <div className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="font-body text-sm text-asphalt">Game reminders</p>
                  <p className="font-body text-xs text-asphalt/50">48h heads-up before tip-off</p>
                </div>
                <Switch
                  checked={emailGameReminders}
                  onCheckedChange={setEmailGameReminders}
                  aria-label="Game reminder emails"
                />
              </div>
              <div className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="font-body text-sm text-asphalt">Bench call-ups</p>
                  <p className="font-body text-xs text-asphalt/50">
                    When you get promoted into a game or a spot is waiting on you
                  </p>
                </div>
                <Switch
                  checked={emailBenchPromotions}
                  onCheckedChange={setEmailBenchPromotions}
                  aria-label="Bench promotion emails"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-terracotta/10 border-2 border-terracotta">
              <p className="text-sm text-terracotta whitespace-pre-line font-body">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="sticker-btn-outline"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || uploading || tag.trim().length < 2 || (!tagChanged && !pieceChanged && !emailPrefsChanged)}
              className="sticker-btn disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
