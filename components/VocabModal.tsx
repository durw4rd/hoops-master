"use client";

import { GraffitiDialog } from "@/components/ui/GraffitiDialog";

const TERMS: { term: string; badge?: string; def: string }[] = [
  {
    term: "Crew",
    def: "Your squad. The group you run with — organize games, track credits, and keep the roster tight.",
  },
  {
    term: "Capo",
    badge: "LEADER",
    def: "The head of the crew. Full control: drop games, manage the roster, set the rules.",
  },
  {
    term: "King",
    badge: "CO-LEADER",
    def: "Second in command. Can drop games and add players, but leaves the heavy calls to the Capo.",
  },
  {
    term: "Drop a Game",
    def: "Create a session. Set the time, spot limit, and price — then watch the spots fill up.",
  },
  {
    term: "Spot",
    def: "Your seat in the game. Claim it, offer it, or lose it — don't sleep.",
  },
  {
    term: "The Bench",
    def: "The waitlist. If the game's full you ride the bench. Soon as a spot opens, first in line gets it.",
  },
  {
    term: "Balances",
    badge: "€",
    def: "What you owe or what you're owed. Every spot you take gets charged; every payment squares it up.",
  },
  {
    term: "Square Up",
    def: "Record a payment from a player. Keeps the ledger honest so nobody's ghosting on the money.",
  },
  {
    term: "Your Tag",
    def: "Your handle in the app — the name other heads see instead of your email.",
  },
  {
    term: "Your Piece",
    def: "Your profile pic. A writer's masterwork. Make it yours.",
  },
  {
    term: "The Black Book",
    def: "Admin-only. The invite list and role manager — only names in the book can get on.",
  },
  {
    term: "Bounce",
    def: "Sign out. Dip. See you at the next run.",
  },
  {
    term: "Burn It Down",
    def: "Delete the crew for good. Games, ledger, everything — gone. No take-backs.",
  },
];

interface VocabModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function VocabModal({ open, onOpenChange }: VocabModalProps) {
  return (
    <GraffitiDialog
      open={open}
      onOpenChange={onOpenChange}
      title="The Word"
      description="Street terms you'll run into. No cap."
      className="max-w-md"
    >
      <div className="space-y-0 divide-y-2 divide-asphalt/10 -mt-1">
        {TERMS.map(({ term, badge, def }) => (
          <div key={term} className="py-3 first:pt-1">
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="font-graffiti text-lg text-asphalt leading-tight">{term}</span>
              {badge && (
                <span className="font-graffiti text-[10px] bg-terracotta text-white px-1.5 py-0.5 leading-none transform rotate-1 inline-block">
                  {badge}
                </span>
              )}
            </div>
            <p className="font-body text-sm text-asphalt/70 leading-snug">{def}</p>
          </div>
        ))}
      </div>
    </GraffitiDialog>
  );
}
