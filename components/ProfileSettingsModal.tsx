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
import { Loader2, SprayCan, ImagePlus, X } from "lucide-react";
import PlayerAvatar from "@/components/PlayerAvatar";

interface ProfileSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentDisplayName: string;
  currentPieceUrl?: string;
  onSaved: (displayName: string) => void;
}

export default function ProfileSettingsModal({
  open,
  onOpenChange,
  currentDisplayName,
  currentPieceUrl,
  onSaved,
}: ProfileSettingsModalProps) {
  const [tag, setTag] = useState(currentDisplayName);
  const [pieceUrl, setPieceUrl] = useState<string | undefined>(currentPieceUrl);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset the fields whenever the modal opens or the source values change.
  useEffect(() => {
    if (open) {
      setTag(currentDisplayName);
      setPieceUrl(currentPieceUrl);
      setError(null);
    }
  }, [open, currentDisplayName, currentPieceUrl]);

  const tagChanged = tag.trim() !== currentDisplayName;
  const pieceChanged = (pieceUrl ?? "") !== (currentPieceUrl ?? "");

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
      const payload: { displayName?: string; pieceUrl?: string | null } = {};
      if (tagChanged) payload.displayName = tag;
      if (pieceChanged) payload.pieceUrl = pieceUrl ?? null;

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
      <DialogContent className="bg-[#F2EFE9] border-4 border-[#1A1A1A] max-w-md mx-2 sm:mx-auto rounded-none shadow-[8px_8px_0_#1A1A1A]">
        <DialogHeader>
          <DialogTitle className="font-graffiti text-2xl text-[#FF5A00] flex items-center gap-2">
            <SprayCan className="w-6 h-6" />
            Your Tag
          </DialogTitle>
          <DialogDescription className="text-[#1A1A1A]/60 font-body">
            Rep your style — set the handle and piece the crew sees on the court.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label className="font-graffiti text-[#1A1A1A]">Your Piece</Label>
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
                  className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-[#1A1A1A] bg-white text-[#1A1A1A] text-xs font-graffiti hover:bg-[#F2EFE9] transition-colors disabled:opacity-50"
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
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-body text-[#1A1A1A]/60 hover:text-[#FF5A00] transition-colors"
                  >
                    <X className="w-3.5 h-3.5" /> Buff it
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-[#1A1A1A]/40 font-body">Your mugshot on the court. JPEG, PNG, WebP or GIF, up to 5MB.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tag" className="font-graffiti text-[#1A1A1A]">
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
            <p className="text-xs text-[#1A1A1A]/40 font-body">2-30 characters</p>
          </div>

          {error && (
            <div className="p-3 bg-[#FF5A00]/10 border-2 border-[#FF5A00]">
              <p className="text-sm text-[#FF5A00] whitespace-pre-line font-body">{error}</p>
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
              disabled={loading || uploading || tag.trim().length < 2 || (!tagChanged && !pieceChanged)}
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
