"use client";

import { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface GraffitiDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  titleClassName?: string;
}

export function GraffitiDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  titleClassName,
}: GraffitiDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "graffiti-dialog max-h-[85vh] overflow-y-auto overflow-x-hidden mx-2 sm:mx-auto min-w-0",
          className
        )}
      >
        <DialogHeader>
          <DialogTitle className={cn("graffiti-dialog-title", titleClassName)}>
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className="font-body text-asphalt/70">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        {children}
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

export function GraffitiErrorBox({ children }: { children: ReactNode }) {
  return (
    <div className="graffiti-error-box">
      <p className="graffiti-error-text font-body">{children}</p>
    </div>
  );
}
