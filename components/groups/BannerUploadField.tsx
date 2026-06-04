"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, X } from "lucide-react";

interface BannerUploadFieldProps {
  /** Current banner URL (uploaded) or empty. */
  value?: string;
  onChange: (url: string | undefined) => void;
  /** When editing an existing crew, gates the upload to Capo/King. */
  groupId?: string;
}

/**
 * File picker + live preview for a crew banner. Uploads the chosen image to
 * Vercel Blob (via /api/groups/banner) immediately and reports the resulting
 * URL through onChange.
 */
export default function BannerUploadField({ value, onChange, groupId }: BannerUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={handleFile}
      />

      {value ? (
        <div className="relative h-28 w-full border-2 border-[#1A1A1A] overflow-hidden">
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
        <button
          type="button"
          onClick={handlePick}
          disabled={uploading}
          className="flex flex-col items-center justify-center gap-2 h-28 w-full border-2 border-dashed border-[#1A1A1A]/50 bg-white hover:bg-[#F2EFE9] transition-colors disabled:opacity-50"
        >
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
