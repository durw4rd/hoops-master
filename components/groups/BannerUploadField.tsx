"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, X, RectangleHorizontal, RectangleVertical } from "lucide-react";

type Orientation = "landscape" | "portrait";

interface BannerUploadFieldProps {
  /** Current banner URL (uploaded) or empty. */
  value?: string;
  onChange: (url: string | undefined) => void;
  /** Banner orientation, controls preview + crew-card layout. */
  orientation?: Orientation;
  onOrientationChange?: (o: Orientation) => void;
  /** When editing an existing crew, gates the upload to Capo/King. */
  groupId?: string;
}

/**
 * File picker + live preview for a crew banner. Uploads the chosen image to
 * Vercel Blob (via /api/groups/banner) immediately and reports the resulting
 * URL through onChange. Also lets the creator tag the banner as landscape or
 * portrait so the crew card can lay itself out accordingly.
 */
export default function BannerUploadField({
  value,
  onChange,
  orientation = "landscape",
  onOrientationChange,
  groupId,
}: BannerUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPortrait = orientation === "portrait";
  const handlePick = () => inputRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (groupId) formData.append("groupId", groupId);

      const res = await fetch("/api/groups/banner", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Upload failed");
        return;
      }
      onChange(data.url);
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const frameClass = isPortrait
    ? "relative h-56 w-40 mx-auto border-2 border-[#1A1A1A] overflow-hidden"
    : "relative h-28 w-full border-2 border-[#1A1A1A] overflow-hidden";
  const emptyClass = isPortrait
    ? "flex flex-col items-center justify-center gap-2 h-56 w-40 mx-auto border-2 border-dashed border-[#1A1A1A]/50 bg-white hover:bg-[#F2EFE9] transition-colors disabled:opacity-50"
    : "flex flex-col items-center justify-center gap-2 h-28 w-full border-2 border-dashed border-[#1A1A1A]/50 bg-white hover:bg-[#F2EFE9] transition-colors disabled:opacity-50";

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={handleFile}
      />

      {/* Orientation toggle */}
      {onOrientationChange && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onOrientationChange("landscape")}
            className={`flex items-center gap-1.5 px-3 py-1.5 border-2 border-[#1A1A1A] text-xs font-graffiti transition-colors ${
              !isPortrait ? "bg-[#FF5A00] text-white" : "bg-white text-[#1A1A1A] hover:bg-[#F2EFE9]"
            }`}
          >
            <RectangleHorizontal className="w-4 h-4" /> Landscape
          </button>
          <button
            type="button"
            onClick={() => onOrientationChange("portrait")}
            className={`flex items-center gap-1.5 px-3 py-1.5 border-2 border-[#1A1A1A] text-xs font-graffiti transition-colors ${
              isPortrait ? "bg-[#FF5A00] text-white" : "bg-white text-[#1A1A1A] hover:bg-[#F2EFE9]"
            }`}
          >
            <RectangleVertical className="w-4 h-4" /> Portrait
          </button>
        </div>
      )}

      {value ? (
        <div className={frameClass}>
          <Image src={value} alt="Crew banner" fill className="object-cover" />
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="absolute top-1 right-1 bg-[#1A1A1A] text-white p-1 hover:bg-[#FF5A00]"
            aria-label="Remove banner"
          >
            <X className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handlePick}
            disabled={uploading}
            className="absolute bottom-1 right-1 bg-[#1A1A1A] text-white text-xs font-graffiti px-2 py-1 hover:bg-[#FF5A00] disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Replace"}
          </button>
        </div>
      ) : (
        <button type="button" onClick={handlePick} disabled={uploading} className={emptyClass}>
          {uploading ? (
            <Loader2 className="w-6 h-6 animate-spin text-[#FF5A00]" />
          ) : (
            <>
              <ImagePlus className="w-6 h-6 text-[#1A1A1A]/60" />
              <span className="font-body text-sm text-[#1A1A1A]/60">Upload a banner (optional)</span>
            </>
          )}
        </button>
      )}

      {error && <p className="text-xs text-[#FF5A00] font-body">{error}</p>}
    </div>
  );
}
