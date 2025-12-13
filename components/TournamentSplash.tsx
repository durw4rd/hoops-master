import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import React from "react";

interface TournamentSplashProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDontShowAgain: () => void;
}

const TournamentSplash: React.FC<TournamentSplashProps> = ({ open, onOpenChange, onDontShowAgain }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="bg-gradient-to-br from-yellow-300 via-orange-200 to-yellow-100 border-yellow-500 text-yellow-900 text-center shadow-2xl ring-4 ring-yellow-400">
      <DialogHeader>
        <DialogTitle className="text-3xl font-extrabold flex items-center justify-center gap-2">
          <span role="img" aria-label="trophy">🏆</span>
          <span className="drop-shadow-lg">TOURNAMENT NIGHT</span>
          <span role="img" aria-label="fire">🔥</span>
        </DialogTitle>
        <DialogDescription className="text-xl mt-4 font-semibold text-yellow-900">
          Yo baller!<br/>
          You made the cut for the <span className="font-black text-orange-700">Super-special Tournament Showdown</span> on <span className="font-black text-orange-700">20 August</span>!<br/>
          <span className="block mt-2">Bring your A-game, break some ankles, and let's light up the Marnix court!</span>
          <span className="block mt-2 italic text-yellow-700">No refs, no rules, just pure hoops and hype. See you on the blacktop!</span>
        </DialogDescription>
      </DialogHeader>
      <div className="mt-6 flex flex-col gap-2 items-center">
        <button
          className="bg-yellow-500 hover:bg-yellow-600 text-white font-extrabold py-3 px-8 rounded-full shadow-xl text-lg tracking-wider uppercase transition border-2 border-yellow-700"
          onClick={() => onOpenChange(false)}
        >
          Let's run it!
        </button>
        <button
          className="text-xs text-yellow-800 underline mt-3 hover:text-orange-700"
          onClick={onDontShowAgain}
        >
          Nah, don't show this again
        </button>
      </div>
    </DialogContent>
  </Dialog>
);

export default TournamentSplash; 