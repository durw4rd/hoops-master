"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PricingMode } from "@/lib/types";

interface PricingFieldsProps {
  pricingMode: PricingMode;
  onPricingModeChange: (mode: PricingMode) => void;
  slotCost: string;
  onSlotCostChange: (value: string) => void;
  totalCost: string;
  onTotalCostChange: (value: string) => void;
  disabled?: boolean;
  idPrefix?: string;
}

export default function PricingFields({
  pricingMode,
  onPricingModeChange,
  slotCost,
  onSlotCostChange,
  totalCost,
  onTotalCostChange,
  disabled = false,
  idPrefix = "pricing",
}: PricingFieldsProps) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="font-graffiti text-asphalt">Pricing</Label>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPricingModeChange("per_spot")}
            className={`flex-1 px-3 py-2 border-2 border-asphalt font-graffiti text-sm transition-colors disabled:opacity-50 ${
              pricingMode === "per_spot"
                ? "bg-slate-blue text-white"
                : "bg-white text-asphalt hover:bg-sticker-white"
            }`}
          >
            Per Spot
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPricingModeChange("split_total")}
            className={`flex-1 px-3 py-2 border-2 border-asphalt font-graffiti text-sm transition-colors disabled:opacity-50 ${
              pricingMode === "split_total"
                ? "bg-moss-green text-asphalt"
                : "bg-white text-asphalt hover:bg-sticker-white"
            }`}
          >
            Split Total
          </button>
        </div>
      </div>

      {pricingMode === "per_spot" ? (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-slot-cost`} className="font-graffiti text-asphalt">
            Cost per spot (€)
          </Label>
          <Input
            id={`${idPrefix}-slot-cost`}
            type="number"
            min="0"
            step="0.01"
            value={slotCost}
            onChange={(e) => onSlotCostChange(e.target.value)}
            disabled={disabled}
            className="sketch-input"
          />
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-total-cost`} className="font-graffiti text-asphalt">
            Total event cost (€)
          </Label>
          <Input
            id={`${idPrefix}-total-cost`}
            type="number"
            min="0"
            step="0.1"
            value={totalCost}
            onChange={(e) => onTotalCostChange(e.target.value)}
            disabled={disabled}
            className="sketch-input"
          />
          <p className="text-xs text-asphalt/50 font-body">
            Split across occupied slots when you finalize. +1 slots count separately but bill the spot holder.
          </p>
        </div>
      )}
    </div>
  );
}
