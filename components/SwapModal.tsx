import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { RadioGroup } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import React from "react";

interface SessionOption {
  Date: string;
  Time: string;
  Day: string;
}

interface SwapModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceSlot: string;
  sourceSlotInfo?: { date: string; time: string; player: string };
  target: string;
  onTargetChange: (value: string) => void;
  eligibleSessions: SessionOption[];
  onConfirm: () => void;
  loading: boolean;
}

export default function SwapModal({
  open,
  onOpenChange,
  sourceSlot,
  sourceSlotInfo,
  target,
  onTargetChange,
  eligibleSessions,
  onConfirm,
  loading,
}: SwapModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Offer Slot for Swap</DialogTitle>
          <DialogDescription>
            You are offering to swap out of this session:
          </DialogDescription>
        </DialogHeader>
        <div className="mb-4">
          <div className="font-semibold mb-2">Your Slot Being Offered</div>
          {sourceSlot && (
            <div className="flex items-center gap-2">
              <input type="radio" checked readOnly className="mr-2" />
              <span>
                {sourceSlotInfo 
                  ? `${sourceSlotInfo.date} / ${sourceSlotInfo.time} (${sourceSlotInfo.player})`
                  : sourceSlot.replace(/__/g, ' / ')
                }
              </span>
            </div>
          )}
        </div>
        <div className="mb-4">
          <div className="font-semibold mb-2">Target Sessions (where you are not attending)</div>
          <RadioGroup value={target} onValueChange={onTargetChange}>
            {eligibleSessions.map((session) => (
              <div key={session.Date + session.Time} className="flex items-center gap-2">
                <input
                  type="radio"
                  id={`target-${session.Date}-${session.Time}`}
                  name="swapTarget"
                  value={`${session.Date}__${session.Time}`}
                  checked={target === `${session.Date}__${session.Time}`}
                  onChange={() => onTargetChange(`${session.Date}__${session.Time}`)}
                  className="mr-2"
                />
                <label htmlFor={`target-${session.Date}-${session.Time}`}>{session.Date} / {session.Time} ({session.Day})</label>
              </div>
            ))}
          </RadioGroup>
        </div>
        <DialogFooter>
          <Button onClick={onConfirm} disabled={!sourceSlot || !target || loading}>
            {loading ? "Offering..." : "Confirm Swap Offer"}
          </Button>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 