"use client";

import { GraffitiDialog } from "@/components/ui/GraffitiDialog";
import { Loader2, AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  loading?: boolean;
  variant?: "danger" | "default";
}

export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  loading = false,
  variant = "danger",
}: ConfirmDialogProps) {
  return (
    <GraffitiDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <AlertTriangle className="w-6 h-6" />
          {title}
        </span>
      }
      description={message}
      className="max-w-sm"
    >
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          disabled={loading}
          className="flex-1 bg-sticker-white text-asphalt border-3 border-asphalt font-graffiti text-base py-2.5 px-4 shadow-[3px_3px_0_var(--asphalt-black)] hover:shadow-sticker-md active:shadow-[1px_1px_0_var(--asphalt-black)] transition-all disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className={`flex-1 border-3 border-asphalt font-graffiti text-base py-2.5 px-4 shadow-[3px_3px_0_var(--asphalt-black)] hover:shadow-sticker-md active:shadow-[1px_1px_0_var(--asphalt-black)] transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
            variant === "danger" ? "bg-terracotta text-white" : "bg-asphalt text-white"
          }`}
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {confirmLabel}
        </button>
      </div>
    </GraffitiDialog>
  );
}
