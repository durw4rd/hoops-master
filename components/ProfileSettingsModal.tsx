"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, SprayCan } from "lucide-react";

interface ProfileSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentDisplayName: string;
  onSaved: (displayName: string) => void;
}

export default function ProfileSettingsModal({
  open,
  onOpenChange,
  currentDisplayName,
  onSaved,
}: ProfileSettingsModalProps) {
  const [tag, setTag] = useState(currentDisplayName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the field whenever the modal opens or the source name changes.
  useEffect(() => {
    if (open) {
      setTag(currentDisplayName);
      setError(null);
    }
  }, [open, currentDisplayName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: tag }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to update your tag");
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
            This is the handle the rest of the crew sees on the court.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
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
              disabled={loading || tag.trim().length < 2 || tag.trim() === currentDisplayName}
              className="sticker-btn disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                  Saving...
                </>
              ) : (
                "Save Tag"
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
