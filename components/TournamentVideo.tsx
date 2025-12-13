"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Play } from "lucide-react";

interface TournamentVideoProps {
  videoId: string; // Vimeo video ID (required)
  title?: string;
}

export default function TournamentVideo({ 
  videoId,
  title = "Summer Hoops @het Marnix mini-tournament official draft"
}: TournamentVideoProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleOpenVideo = () => {
    setIsOpen(true);
  };

  return (
    <div className="mt-4">
      {/* Video Button */}
      <Button
        onClick={handleOpenVideo}
        className="w-full bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white font-bold py-4 px-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 border-2 border-yellow-600 group"
      >
        <div className="flex items-center justify-center gap-3">
          <div className="relative">
            <Play className="w-6 h-6 group-hover:scale-110 transition-transform duration-200" />
            <div className="absolute inset-0 bg-white/20 rounded-full animate-ping"></div>
          </div>
          <span className="text-lg">
            <span role="img" aria-label="trophy">🏆</span>
            Watch Team Announcement
            <span role="img" aria-label="fire">🔥</span>
          </span>
        </div>
      </Button>

      {/* Video Modal */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-4xl w-[90vw] p-0 bg-black border-2 border-yellow-400 shadow-2xl">
          <DialogHeader className="p-4 bg-gradient-to-r from-yellow-400 to-orange-500">
            <DialogTitle className="text-white font-bold flex items-center gap-2">
              <span role="img" aria-label="trophy">🏆</span>
              {title}
              <span role="img" aria-label="fire">🔥</span>
            </DialogTitle>
          </DialogHeader>
          
          <div className="relative w-full" style={{ paddingBottom: '56.6%' }}>
            <iframe
              key={videoId}
              src={`https://player.vimeo.com/video/${videoId}?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1`}
              title={title}
              className="absolute top-0 left-0 w-full h-full"
              allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
          
          <div className="p-4 bg-gradient-to-r from-yellow-100 to-orange-100 text-center">
            <p className="text-sm font-semibold text-yellow-800">
              <span role="img" aria-label="basketball">🏀</span>
              The teams are ready to battle! 
              <span role="img" aria-label="crown">👑</span>
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
