import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface SlotSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionInfo: { date: string; time: string; player: string };
  slotCount: number;
  onConfirm: (selectedSlots: number[]) => void;
  loading: boolean;
  actionType: 'offer' | 'swap';
}

const SlotSelectionModal: React.FC<SlotSelectionModalProps> = ({
  open,
  onOpenChange,
  sessionInfo,
  slotCount,
  onConfirm,
  loading,
  actionType,
}) => {
  const [selectedSlots, setSelectedSlots] = useState<number[]>([]);

  const handleSlotToggle = (slotIndex: number) => {
    setSelectedSlots(prev => 
      prev.includes(slotIndex) 
        ? prev.filter(i => i !== slotIndex)
        : [...prev, slotIndex]
    );
  };

  const handleConfirm = () => {
    if (selectedSlots.length > 0) {
      onConfirm(selectedSlots);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedSlots([]); // Reset selection when closing
    }
    onOpenChange(newOpen);
  };

  const actionText = actionType === 'offer' ? 'Offer for grabs' : 'Offer for swap';
  const actionDescription = actionType === 'offer' 
    ? 'Choose which of your slots to offer for grabs'
    : 'Choose which of your slots to offer for swap';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Select Slots to {actionText}</DialogTitle>
          <DialogDescription>
            {actionDescription} for {sessionInfo.date} / {sessionInfo.time}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="text-sm text-gray-600 mb-4">
            You have {slotCount} slot{slotCount > 1 ? 's' : ''} in this session. 
            {actionType === 'offer' && ' You can offer one or both slots.'}
            {actionType === 'swap' && ' You can only offer one slot for swap.'}
          </div>
          
          <div className="space-y-3">
            {Array.from({ length: slotCount }, (_, index) => (
              <div key={index} className="flex items-center space-x-3">
                <Checkbox
                  id={`slot-${index}`}
                  checked={selectedSlots.includes(index)}
                  onCheckedChange={() => handleSlotToggle(index)}
                  disabled={actionType === 'swap' && selectedSlots.length === 1 && !selectedSlots.includes(index)}
                />
                <Label htmlFor={`slot-${index}`} className="text-sm font-medium">
                  Slot {index + 1}
                </Label>
              </div>
            ))}
          </div>
          
          {actionType === 'swap' && selectedSlots.length > 1 && (
            <div className="text-sm text-orange-600 bg-orange-50 p-3 rounded-lg">
              ⚠️ For swaps, only one slot can be selected at a time.
            </div>
          )}
        </div>
        
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={handleConfirm}
            disabled={selectedSlots.length === 0 || loading}
            className={actionType === 'offer' ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}
          >
            {loading ? "Processing..." : actionText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SlotSelectionModal; 