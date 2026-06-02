"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  /** "danger" (default) uses the orange destructive sticker; "default" uses the dark one. */
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#F2EFE9] border-4 border-[#1A1A1A] max-w-sm mx-2 sm:mx-auto rounded-none shadow-[8px_8px_0_#1A1A1A]">
        <DialogHeader>
          <DialogTitle className="font-graffiti text-2xl text-[#FF5A00] flex items-center gap-2">
            <AlertTriangle className="w-6 h-6" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-[#1A1A1A]/70 font-body pt-1">
            {message}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="flex-1 bg-white text-[#1A1A1A] border-3 border-[#1A1A1A] font-graffiti text-base py-2.5 px-4 shadow-[3px_3px_0_#1A1A1A] hover:shadow-[5px_5px_0_#1A1A1A] active:shadow-[1px_1px_0_#1A1A1A] transition-all disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 border-3 border-[#1A1A1A] font-graffiti text-base py-2.5 px-4 shadow-[3px_3px_0_#1A1A1A] hover:shadow-[5px_5px_0_#1A1A1A] active:shadow-[1px_1px_0_#1A1A1A] transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
              variant === "danger" ? "bg-[#FF5A00] text-white" : "bg-[#1A1A1A] text-white"
            }`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
