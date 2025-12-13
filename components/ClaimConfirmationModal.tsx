import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import React from "react";

interface ClaimConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingSlot: any;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'claim' | 'swap';
  alreadyInSession?: boolean;
}

export default function ClaimConfirmationModal({
  open,
  onOpenChange,
  pendingSlot,
  onConfirm,
  onCancel,
  type = 'claim',
  alreadyInSession = false,
}: ClaimConfirmationModalProps) {
  const isSwap = type === 'swap';
  const date = pendingSlot?.Date || pendingSlot?.date || '';
  const time = pendingSlot?.Time || pendingSlot?.time || '';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isSwap ? 'Accept Swap Offer?' : 'Claim This Spot?'}
          </DialogTitle>
          <DialogDescription>
            {alreadyInSession ? (
              <span className="text-orange-700 font-semibold">
                You are already in this session. Are you sure you want to {isSwap ? 'swap for another spot' : 'claim another spot'} for {date} / {time}?
              </span>
            ) : (
              isSwap
                ? `Are you sure you want to accept this swap offer for ${date} / ${time}?`
                : `Are you sure you want to claim this spot for ${date} / ${time}?`
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant="default" onClick={onConfirm}>
            {isSwap ? 'Yes, accept swap' : 'Yes, claim spot'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 