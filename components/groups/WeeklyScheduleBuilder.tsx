"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import {
  DAYS_OF_WEEK,
  TIME_OPTIONS,
  BLOCK_LENGTH_OPTIONS,
  splitIntoBlocks,
  type ScheduleSlot,
} from "@/lib/schedule";

interface WeeklyScheduleBuilderProps {
  slots: ScheduleSlot[];
  onSlotsChange: (slots: ScheduleSlot[]) => void;
  blockMinutes: number;
  onBlockMinutesChange: (minutes: number) => void;
}

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function WeeklyScheduleBuilder({
  slots,
  onSlotsChange,
  blockMinutes,
  onBlockMinutesChange,
}: WeeklyScheduleBuilderProps) {
  const updateSlot = (index: number, patch: Partial<ScheduleSlot>) => {
    onSlotsChange(slots.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const addSlot = () => {
    const last = slots[slots.length - 1];
    onSlotsChange([
      ...slots,
      last
        ? { ...last, dayOfWeek: (last.dayOfWeek + 1) % 7 }
        : { dayOfWeek: 1, startTime: "18:00", endTime: "20:00" },
    ]);
  };

  const removeSlot = (index: number) => {
    onSlotsChange(slots.filter((_, i) => i !== index));
  };

  // Games per week = sum of blocks across every slot.
  const gamesPerWeek = slots.reduce(
    (acc, s) =>
      s.startTime && s.endTime ? acc + splitIntoBlocks(s.startTime, s.endTime, blockMinutes).length : acc,
    0
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="font-graffiti text-[#1A1A1A]">Weekly Slots</Label>
        <button
          type="button"
          onClick={addSlot}
          className="flex items-center gap-1 text-xs font-graffiti text-[#0084FF] hover:text-[#FF5A00] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add slot
        </button>
      </div>

      <div className="space-y-2">
        {slots.map((slot, i) => (
          <div key={i} className="flex items-center gap-1.5 border-2 border-[#1A1A1A] bg-white p-1.5">
            <Select
              value={String(slot.dayOfWeek)}
              onValueChange={(v) => updateSlot(i, { dayOfWeek: parseInt(v) })}
            >
              <SelectTrigger className="sketch-input h-9 px-2 flex-1 min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS_OF_WEEK.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={slot.startTime} onValueChange={(v) => updateSlot(i, { startTime: v })}>
              <SelectTrigger className="sketch-input h-9 px-2 w-[72px] flex-shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {TIME_OPTIONS.map((t) => (
                  <SelectItem key={`s-${i}-${t}`} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-[#1A1A1A]/40 text-xs">–</span>
            <Select value={slot.endTime} onValueChange={(v) => updateSlot(i, { endTime: v })}>
              <SelectTrigger className="sketch-input h-9 px-2 w-[72px] flex-shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {TIME_OPTIONS.map((t) => (
                  <SelectItem key={`e-${i}-${t}`} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={() => removeSlot(i)}
              disabled={slots.length === 1}
              className="border-2 border-[#1A1A1A] bg-white p-1.5 disabled:opacity-30 hover:bg-[#F2EFE9] flex-shrink-0"
              title="Remove slot"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="space-y-1">
        <Label className="font-graffiti text-[#1A1A1A]">Split each slot into</Label>
        <Select value={String(blockMinutes)} onValueChange={(v) => onBlockMinutesChange(parseInt(v))}>
          <SelectTrigger className="sketch-input">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BLOCK_LENGTH_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-[#1A1A1A]/50 font-body">
        ={" "}
        <span className="font-graffiti text-[#1A1A1A]">{gamesPerWeek}</span> game
        {gamesPerWeek === 1 ? "" : "s"} per week
        {slots.length > 0 && (
          <>
            {" — "}
            {slots
              .filter((s) => s.startTime && s.endTime)
              .map((s) => `${SHORT_DAYS[s.dayOfWeek]} ${s.startTime}–${s.endTime}`)
              .join(", ")}
          </>
        )}
      </p>
    </div>
  );
}
