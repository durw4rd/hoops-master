import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";
import SlotSelectionModal from "@/components/SlotSelectionModal";
import TournamentTeams from "@/components/TournamentTeams";
// Remove icon imports
// import { Gift, Repeat, UserPlus } from "lucide-react";
import { getOptimizedProfileImage, handleProfileImageError, normalizeDate, isSessionInPast } from "@/lib/utils";
import { TournamentData } from "@/lib/googleSheets";

interface Session {
  id: string;
  time: string;
  hour: string;
  players: string[];
  maxPlayers: number;
}

interface Game {
  id: string;
  date: string;
  day: string;
  sessions: Session[];
}

interface UserMapping {
  [player: string]: { email: string; color?: string; role?: string };
}

interface ScheduleCardProps {
  game: Game;
  userMapping: UserMapping;
  playerName?: string;
  allSlots: any[];
  condensedMode: boolean;
  slotActionLoading: string | null;
  handleOfferSlot: (date: string, time: string, player: string, sessionId: string) => void;
  handleRequestSwap: (slot: any) => void;
  onReassignClick?: (sessionInfo: { date: string; time: string; currentPlayer: string }) => void;
  onClaimAvailableSlot?: (info: { date: string; time: string }) => void;
  adminMode?: boolean;
  onAdminReassignClick?: (sessionInfo: { date: string; time: string; currentPlayer: string }) => void;
  showTournamentFeatures?: boolean;
  tournamentData?: TournamentData;
  tournamentDataLoading?: boolean;
}

function getSlotForSession(availableSlots: any[], date: string, time: string, player: string) {
  const normalize = (v: string) => v.trim().toLowerCase();
  return availableSlots.find(
    (slot) =>
      normalizeDate(slot.Date) === normalizeDate(date) &&
      normalize(slot.Time) === normalize(time) &&
      normalize(slot.Player) === normalize(player) &&
      slot.Status === "offered"
  );
}

function getUserSlotCount(session: any, playerName: string): number {
  if (!playerName) return 0;
  return session.players.filter((p: string) => 
    p.toLowerCase() === playerName.toLowerCase()
  ).length;
}

function getUserOfferedSlots(allSlots: any[], date: string, time: string, playerName: string): any[] {
  const normalize = (v: string) => v.trim().toLowerCase();
  return allSlots.filter(
    (slot) =>
      normalizeDate(slot.Date) === normalizeDate(date) &&
      normalize(slot.Time) === normalize(time) &&
      normalize(slot.Player) === normalize(playerName) &&
      slot.Status === "offered"
  );
}

// Validation: Prevent more than 2 slots per user per session
function validateSlotCount(session: any, playerName: string): boolean {
  const slotCount = getUserSlotCount(session, playerName);
  return slotCount <= 2;
}

// Check if a player has an active offer for grabs in this session
function hasActiveOfferForGrabs(allSlots: any[], date: string, time: string, player: string): boolean {
  const normalize = (v: string) => v.trim().toLowerCase();
  return allSlots.some(slot => 
    normalizeDate(slot.Date) === normalizeDate(date) &&
    normalize(slot.Time) === normalize(time) &&
    normalize(slot.Player) === normalize(player) &&
    slot.Status === 'offered' &&
    slot.SwapRequested !== 'yes'
  );
}

// Check if a player has an active swap offer in this session
function hasActiveSwapOffer(allSlots: any[], date: string, time: string, player: string): boolean {
  const normalize = (v: string) => v.trim().toLowerCase();
  return allSlots.some(slot => 
    normalizeDate(slot.Date) === normalizeDate(date) &&
    normalize(slot.Time) === normalize(time) &&
    normalize(slot.Player) === normalize(player) &&
    slot.Status === 'offered' &&
    slot.SwapRequested === 'yes'
  );
}

export default function ScheduleCard({
  game,
  userMapping,
  playerName,
  allSlots,
  condensedMode,
  slotActionLoading,
  handleOfferSlot,
  handleRequestSwap,
  onReassignClick,
  onClaimAvailableSlot,
  adminMode = false,
  onAdminReassignClick,
  showTournamentFeatures = false,
  tournamentData = { teams: [] },
  tournamentDataLoading = false,
}: ScheduleCardProps) {
  // Slot selection modal state
  const [slotSelectionModalOpen, setSlotSelectionModalOpen] = useState(false);
  const [slotSelectionAction, setSlotSelectionAction] = useState<'offer' | 'swap'>('offer');
  const [slotSelectionSession, setSlotSelectionSession] = useState<{ date: string; time: string; player: string } | null>(null);
  const [slotSelectionCount, setSlotSelectionCount] = useState(0);
  return (
    <Card
      key={game.id}
      className={`border-l-4 ${game.date === '20.08' ? 'border-l-yellow-500 bg-yellow-50 shadow-lg ring-2 ring-yellow-300' : 'border-l-orange-500'}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            {game.day} ({game.date})
            {game.date === '20.08' && (
              <span className="ml-2 px-3 py-1 rounded-full bg-yellow-400 text-yellow-900 font-bold text-xs border border-yellow-600 flex items-center gap-1 animate-pulse">
                <span role="img" aria-label="trophy">🏆</span> Tournament
              </span>
            )}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {game.sessions.map((session: any) => {
          const sessionId = `${game.date}-${session.time}`;
          const isUserParticipant = playerName && session.players.some((p: string) => p.toLowerCase() === playerName!.toLowerCase());
          const userSlotCount = getUserSlotCount(session, playerName!);
          const userOfferedSlots = getUserOfferedSlots(allSlots, game.date, session.time, playerName!);
          const userRegularOfferedSlots = userOfferedSlots.filter(slot => slot.SwapRequested !== 'yes');
          const userSwapOfferedSlots = userOfferedSlots.filter(slot => slot.SwapRequested === 'yes');
          
          // Check if user has any offered slots (for UI display)
          const hasOfferedSlots = userOfferedSlots.length > 0;
          const hasRegularOfferedSlots = userRegularOfferedSlots.length > 0;
          const hasSwapOfferedSlots = userSwapOfferedSlots.length > 0;
          // Count available slots for this session
          const availableCount = allSlots.filter(
            (slot: any) =>
              normalizeDate(slot.Date) === normalizeDate(game.date) &&
              slot.Time.trim() === session.time.trim() &&
              slot.Status === 'offered' &&
              slot.SwapRequested !== 'yes'
          ).length;
          // Count swap offers for this session
          const swapOfferCount = allSlots.filter(
            (slot: any) =>
              normalizeDate(slot.Date) === normalizeDate(game.date) &&
              slot.Time.trim() === session.time.trim() &&
              slot.Status === 'offered' &&
              slot.SwapRequested === 'yes'
          ).length;
          return (
            <div
              key={session.id}
              className={`p-4 rounded-lg border-2 ${
                playerName && session.players.some((p: string) => p.toLowerCase() === playerName!.toLowerCase())
                  ? "bg-orange-50 border-orange-200"
                  : "bg-gray-50 border-gray-200"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center justify-between w-full">
                  <Badge
                    variant={playerName && session.players.some((p: string) => p.toLowerCase() === playerName!.toLowerCase()) ? "default" : "secondary"}
                    className={playerName && session.players.some((p: string) => p.toLowerCase() === playerName!.toLowerCase()) ? "bg-orange-500" : ""}
                  >
                    {session.hour}
                  </Badge>
                  {/* Available slots indicator */}
                  {availableCount > 0 && (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-300">
                      Available: {availableCount}
                    </span>
                  )}
                  {/* Swap offers indicator */}
                  {swapOfferCount > 0 && (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-300">
                      Swaps: {swapOfferCount}
                    </span>
                  )}
                  {/* Removed player count */}
                </div>
              </div>
              {/* Subtle separator between badges and player names */}
              <Separator className="my-2" />
              {(!condensedMode && session.players.length > 0) && (
                <>
                  <div className="mt-3 flex flex-wrap gap-1 relative group">
                    {/* Group and count players to avoid duplicate keys and show +N for multiples */}
                    {(() => {
                      const playerCounts: Record<string, number> = {};
                      session.players.forEach((p: string) => {
                        playerCounts[p] = (playerCounts[p] || 0) + 1;
                      });
                      const uniquePlayers = Object.keys(playerCounts);
                      return uniquePlayers.map((playerId, idx) => {
                        const playerColor = userMapping[playerId]?.color;
                        const isCurrentUser = playerName && playerId.toLowerCase() === playerName.toLowerCase();
                        const count = playerCounts[playerId];
                        const isClickable = adminMode && onAdminReassignClick;
                        
                        // Check for active offers
                        const hasOfferForGrabs = hasActiveOfferForGrabs(allSlots, game.date, session.time, playerId);
                        const hasSwapOffer = hasActiveSwapOffer(allSlots, game.date, session.time, playerId);
                        
                        // Determine styling based on offers
                        let offerStyling = "";
                        if (hasOfferForGrabs) {
                          offerStyling = "border-2 border-red-400";
                        } else if (hasSwapOffer) {
                          offerStyling = "border-2 border-blue-400";
                        }
                        
                        return (
                          <div
                            key={playerId + '-' + idx}
                            className={`flex items-center space-x-1 bg-white rounded-full px-2 py-1 text-xs ${
                              isCurrentUser ? "font-bold text-orange-600" : ""
                            } ${
                              isClickable 
                                ? "cursor-pointer hover:bg-red-50 hover:border-red-300 border border-transparent transition-colors" 
                                : ""
                            } ${offerStyling}`}
                            style={playerColor ? { backgroundColor: playerColor, color: '#fff' } : {}}
                            onClick={isClickable ? () => onAdminReassignClick!({ 
                              date: game.date, 
                              time: session.time, 
                              currentPlayer: playerId 
                            }) : undefined}
                            title={
                              isClickable 
                                ? `Admin: Click to reassign ${playerId}'s slot`
                                : hasOfferForGrabs 
                                  ? `${playerId} has a slot offered for grabs`
                                  : hasSwapOffer 
                                    ? `${playerId} has a slot offered for swap`
                                    : undefined
                            }
                          >
                            <Avatar className="w-4 h-4">
                              <AvatarImage
                                src={getOptimizedProfileImage(playerId)}
                                onError={(e) => handleProfileImageError(e, playerId)}
                              />
                              <AvatarFallback className="text-xs">
                                {playerId
                                  .split(" ")
                                  .map((n: string) => n[0])
                                  .join("")}
                              </AvatarFallback>
                            </Avatar>
                            <span>
                              {isCurrentUser ? "You" : playerId.split(" ")[0]}
                              {count > 1 && (
                                <span className="ml-1 text-xs font-semibold">+{count - 1}</span>
                              )}
                            </span>
                            {/* Offer indicators */}
                            {hasOfferForGrabs && (
                              <span className="ml-1 w-2 h-2 bg-red-500 rounded-full" title="Slot offered for grabs"></span>
                            )}
                            {hasSwapOffer && (
                              <span className="ml-1 w-2 h-2 bg-blue-500 rounded-full" title="Slot offered for swap"></span>
                            )}
                            {isClickable && (
                              <span className="ml-1 text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                🔧
                              </span>
                            )}
                          </div>
                        );
                      });
                    })()}
                    <span className="absolute bottom-0 right-0 text-xs text-gray-500 bg-white bg-opacity-80 px-2 py-0.5 rounded">
                      {session.players.length}/{session.maxPlayers}
                    </span>
                  </div>
                  {/* Always show subtle separator below player names */}
                  <Separator className="my-2" />
                </>
              )}
              {/* Show tag for user's slot offer type, only one at a time, and only for active offers, below player list or in same place if condensed */}
              {isUserParticipant && (
                hasSwapOfferedSlots ? (
                  <span className="border border-blue-500 text-blue-600 bg-blue-50 font-semibold rounded-full px-3 py-1 text-xs inline-block mt-1 mb-0">
                    Up for Swap
                  </span>
                ) : hasRegularOfferedSlots ? (
                  <span className="border border-red-500 text-red-600 bg-red-50 font-semibold rounded-full px-3 py-1 text-xs inline-block mt-1 mb-0">
                    Up for Grabs
                  </span>
                ) : null
              )}
              {/* Slot for grabs actions */}
              {isUserParticipant && !hasOfferedSlots && (
                <div className="mt-3 flex flex-row w-full gap-x-1">
                  {!isSessionInPast(game.date) && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 min-w-0 whitespace-normal h-auto rounded-md font-semibold border-red-500 text-red-600 hover:bg-red-50 flex items-center justify-center gap-1"
                        disabled={slotActionLoading === sessionId}
                        onClick={() => {
                          if (userSlotCount > 1) {
                            setSlotSelectionAction('offer');
                            setSlotSelectionSession({ date: game.date, time: session.time, player: playerName! });
                            setSlotSelectionCount(userSlotCount);
                            setSlotSelectionModalOpen(true);
                          } else {
                            handleOfferSlot(game.date, session.time, playerName!, sessionId);
                          }
                        }}
                      >
                        {slotActionLoading === sessionId ? "Offering..." : "Offer for grabs"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 min-w-0 whitespace-normal h-auto rounded-md font-semibold border-blue-500 text-blue-600 hover:bg-blue-50 flex items-center justify-center gap-1"
                        onClick={() => {
                          if (userSlotCount > 1) {
                            setSlotSelectionAction('swap');
                            setSlotSelectionSession({ date: game.date, time: session.time, player: playerName! });
                            setSlotSelectionCount(userSlotCount);
                            setSlotSelectionModalOpen(true);
                          } else {
                            handleRequestSwap({ Date: game.date, Time: session.time });
                          }
                        }}
                      >
                        Offer for swap
                      </Button>
                    </>
                  )}
                  {/* Only show reassign button if user is a participant in this session */}
                  {onReassignClick && isUserParticipant && (
                    <Button
                      size="sm"
                      variant="outline"
                      className={`${!isSessionInPast(game.date) ? 'flex-1' : 'w-full'} min-w-0 whitespace-normal h-auto rounded-md font-semibold border-gray-400 text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1`}
                      onClick={() => onReassignClick({ date: game.date, time: session.time, currentPlayer: playerName! })}
                    >
                      Reassign
                    </Button>
                  )}
                </div>
              )}
              {/* Claim available slot button for non-participants if session is not full */}
              {playerName && !isUserParticipant && session.players.length < session.maxPlayers && !isSessionInPast(game.date) && (
                <Button
                  size="sm"
                  variant="default"
                  className="mt-2"
                  onClick={() => onClaimAvailableSlot && onClaimAvailableSlot({ date: game.date, time: session.time })}
                >
                  Claim available slot
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
      
      {/* Tournament Features - Only show for tournament session (20.08) */}
      {game.date === '20.08' && playerName && (
        <div className="px-6 pb-6">
          {/* Check if user is attending the tournament */}
          {game.sessions.some((session: any) => 
            session.players.some((p: string) => p.toLowerCase() === playerName.toLowerCase())
          ) && (
            <>
              {/* Tournament Teams */}
              {tournamentData && tournamentData.teams.length > 0 && (
                <TournamentTeams 
                  teams={tournamentData.teams} 
                  userMapping={userMapping} 
                />
              )}
            </>
          )}
        </div>
      )}
      
      {/* Slot Selection Modal */}
      {slotSelectionSession && (
        <SlotSelectionModal
          open={slotSelectionModalOpen}
          onOpenChange={setSlotSelectionModalOpen}
          sessionInfo={slotSelectionSession}
          slotCount={slotSelectionCount}
          onConfirm={(selectedSlots) => {
            if (slotSelectionAction === 'offer') {
              // For offers, create multiple entries if multiple slots selected
              selectedSlots.forEach((slotIndex) => {
                handleOfferSlot(slotSelectionSession.date, slotSelectionSession.time, slotSelectionSession.player, `${slotSelectionSession.date}-${slotSelectionSession.time}-${slotIndex}`);
              });
            } else {
              // For swaps, only use the first selected slot
              const selectedSlotIndex = selectedSlots[0];
              handleRequestSwap({ 
                Date: slotSelectionSession.date, 
                Time: slotSelectionSession.time,
                SlotIndex: selectedSlotIndex 
              });
            }
            setSlotSelectionModalOpen(false);
          }}
          loading={slotActionLoading !== null}
          actionType={slotSelectionAction}
        />
      )}
    </Card>
  );
} 