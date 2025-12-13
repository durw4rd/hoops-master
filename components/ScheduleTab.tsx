import { Button } from "@/components/ui/button";
import ScheduleCard from "@/components/ScheduleCard";
import React, { useState, useEffect } from "react";
import UnifiedReassignModal from "@/components/UnifiedReassignModal";
import FilterBar, { FilterItem } from "@/components/ui/filter-bar";
import { getStorageKey, saveToStorage, loadFromStorage } from "@/lib/persistence";
import { normalizeDate } from "@/lib/utils";
import { TournamentData } from "@/lib/googleSheets";

interface ScheduleTabProps {
  scheduleToDisplay: any[];
  userMapping: Record<string, { email: string; color?: string; role?: string }>;
  playerName?: string;
  allSlots: any[];
  condensedMode: boolean;
  setCondensedMode: (v: boolean) => void;
  slotActionLoading: string | null;
  handleOfferSlot: (date: string, time: string, player: string, sessionId: string) => void;
  handleRequestSwap: (slot: any) => void;
  scheduleLoading: boolean;
  scheduleTabLoading?: boolean;
  showAll: boolean;
  showPast: boolean;
  setShowAll: (v: (prev: boolean) => boolean) => void;
  setShowPast: (v: (prev: boolean) => boolean) => void;
  loggedInUser: any;
  onClaimAvailableSlot?: (info: { date: string; time: string }) => void;
  onScheduleRefresh?: () => Promise<void>;
  adminMode?: boolean;
  showTournamentFeatures?: boolean;
  tournamentData?: TournamentData;
  tournamentDataLoading?: boolean;
}

const ScheduleTab: React.FC<ScheduleTabProps> = ({
  scheduleToDisplay,
  userMapping,
  playerName,
  allSlots,
  condensedMode,
  setCondensedMode,
  slotActionLoading,
  handleOfferSlot,
  handleRequestSwap,
  scheduleLoading,
  scheduleTabLoading = false,
  showAll,
  showPast,
  setShowAll,
  setShowPast,
  loggedInUser,
  onClaimAvailableSlot,
  onScheduleRefresh,
  adminMode = false,
  showTournamentFeatures = false,
  tournamentData = { teams: [] },
  tournamentDataLoading = false,
}) => {
  // Unified reassignment state
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [reassignSession, setReassignSession] = useState<{ date: string; time: string; currentPlayer: string } | null>(null);
  const [reassignLoading, setReassignLoading] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [reassignSelectedPlayer, setReassignSelectedPlayer] = useState<string>("");
  const [reassignWarn, setReassignWarn] = useState(false);
  const [reassignConfirm, setReassignConfirm] = useState(false);

  // Admin reassignment state
  const [adminReassignModalOpen, setAdminReassignModalOpen] = useState(false);
  const [adminReassignSession, setAdminReassignSession] = useState<{ date: string; time: string; currentPlayer: string } | null>(null);
  const [adminReassignLoading, setAdminReassignLoading] = useState(false);
  const [adminReassignError, setAdminReassignError] = useState<string | null>(null);
  const [adminReassignSelectedPlayer, setAdminReassignSelectedPlayer] = useState<string>("");
  const [adminReassignWarn, setAdminReassignWarn] = useState(false);
  const [adminReassignConfirm, setAdminReassignConfirm] = useState(false);

  // Track if component has mounted to prevent hydration mismatches
  const [hasMounted, setHasMounted] = useState(false);

  // Set mounted state after hydration
  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Load saved filter states on component mount (client-side only)
  useEffect(() => {
    if (hasMounted && loggedInUser?.user?.email) {
      const userId = loggedInUser.user.email;
      
      // Load showAll filter
      const showAllKey = getStorageKey(userId, 'schedule', 'showAll');
      const savedShowAll = loadFromStorage(showAllKey, false);
      setShowAll(() => savedShowAll);
      
      // Load showPast filter
      const showPastKey = getStorageKey(userId, 'schedule', 'showPast');
      const savedShowPast = loadFromStorage(showPastKey, false);
      setShowPast(() => savedShowPast);
      
      // Load condensedMode filter
      const condensedModeKey = getStorageKey(userId, 'schedule', 'condensedMode');
      const savedCondensedMode = loadFromStorage(condensedModeKey, false);
      setCondensedMode(savedCondensedMode);
    }
  }, [hasMounted, loggedInUser?.user?.email, setShowAll, setShowPast, setCondensedMode]);

  // Save filter states when they change (client-side only)
  useEffect(() => {
    if (hasMounted && loggedInUser?.user?.email) {
      const userId = loggedInUser.user.email;
      
      const showAllKey = getStorageKey(userId, 'schedule', 'showAll');
      saveToStorage(showAllKey, showAll);
      
      const showPastKey = getStorageKey(userId, 'schedule', 'showPast');
      saveToStorage(showPastKey, showPast);
      
      const condensedModeKey = getStorageKey(userId, 'schedule', 'condensedMode');
      saveToStorage(condensedModeKey, condensedMode);
    }
  }, [hasMounted, showAll, showPast, condensedMode, loggedInUser?.user?.email]);

  // Helper to check if current user is a participant in a session
  function isUserParticipantInSession(date: string, time: string) {
    for (const game of scheduleToDisplay) {
      if (normalizeDate(game.date) === normalizeDate(date)) {
        for (const session of game.sessions) {
          if (session.time.trim() === time.trim()) {
            return session.players.some((p: string) => p.toLowerCase() === playerName?.toLowerCase());
          }
        }
      }
    }
    return false;
  }

  function handleReassignClick(sessionInfo: { date: string; time: string; currentPlayer: string }) {
    // Only allow player reassignment if user is a participant in this session
    if (!isUserParticipantInSession(sessionInfo.date, sessionInfo.time)) {
      return; // Don't open modal if user is not eligible
    }
    setReassignSession(sessionInfo);
    setReassignModalOpen(true);
    setReassignSelectedPlayer("");
    setReassignConfirm(false);
    setReassignWarn(false);
    setReassignError(null);
  }

  function handleAdminReassignClick(sessionInfo: { date: string; time: string; currentPlayer: string }) {
    // Only allow admin reassignment if admin mode is enabled
    if (!adminMode) {
      return; // Don't open modal if not admin
    }
    setAdminReassignSession(sessionInfo);
    setAdminReassignModalOpen(true);
    setAdminReassignSelectedPlayer("");
    setAdminReassignConfirm(false);
    setAdminReassignWarn(false);
    setAdminReassignError(null);
  }

  // Helper to check if a player is already in the session
  function isPlayerInSession(date: string, time: string, player: string) {
    for (const game of scheduleToDisplay) {
      if (normalizeDate(game.date) === normalizeDate(date)) {
        for (const session of game.sessions) {
          if (session.time.trim() === time.trim()) {
            return session.players.some((p: string) => p.toLowerCase() === player.toLowerCase());
          }
        }
      }
    }
    return false;
  }

  function getPlayerSlotCount(date: string, time: string, player: string) {
    for (const game of scheduleToDisplay) {
      if (normalizeDate(game.date) === normalizeDate(date)) {
        for (const session of game.sessions) {
          if (session.time.trim() === time.trim()) {
            return session.players.filter((p: string) => p.toLowerCase() === player.toLowerCase()).length;
          }
        }
      }
    }
    return 0;
  }

  function canPlayerReceiveSlot(date: string, time: string, player: string) {
    const slotCount = getPlayerSlotCount(date, time, player);
    return slotCount < 2;
  }

  function getPlayerValidationState(date: string, time: string, player: string): {
    isValid: boolean;
    message: string | null;
    type: 'error' | 'warning' | 'none';
  } {
    const slotCount = getPlayerSlotCount(date, time, player);
    const isInSession = isPlayerInSession(date, time, player);
    
    if (slotCount >= 2) {
      return {
        isValid: false,
        message: `This player already has ${slotCount} slots in this session. Maximum 2 slots allowed per player.`,
        type: 'error'
      };
    } else if (isInSession && slotCount === 1) {
      return {
        isValid: true,
        message: `This player already has 1 slot in this session. Reassigning will give them a second slot.`,
        type: 'warning'
      };
    } else {
      return {
        isValid: true,
        message: null,
        type: 'none'
      };
    }
  }

  async function handleReassign(newPlayer: string, slotIndex?: number) {
    if (!reassignSession) return;
    setReassignError(null);
    setReassignSelectedPlayer(newPlayer);
    // Check if player is already in session
    const alreadyInSession = isPlayerInSession(reassignSession.date, reassignSession.time, newPlayer);
    if (alreadyInSession && !reassignConfirm) {
      setReassignWarn(true);
      setReassignConfirm(true);
      return;
    }
    setReassignLoading(true);
    try {
      const res = await fetch("/api/schedule/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: reassignSession.date,
          time: reassignSession.time,
          fromPlayer: reassignSession.currentPlayer,
          toPlayer: newPlayer,
          slotIndex: slotIndex, // Pass slot index for multiple slot handling
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Reassignment failed");
      setReassignModalOpen(false);
      setReassignSession(null);
      setReassignSelectedPlayer("");
      setReassignConfirm(false);
      setReassignWarn(false);
      await new Promise(r => setTimeout(r, 300)); // UX: allow modal to close
      // Refresh schedule data after successful reassignment
      if (onScheduleRefresh) {
        await onScheduleRefresh();
      }
    } catch (err: any) {
      setReassignError(err.message || "Reassignment failed");
    } finally {
      setReassignLoading(false);
    }
  }

  async function handleAdminReassign(newPlayer: string, slotIndex?: number) {
    if (!adminReassignSession) return;
    
    setAdminReassignLoading(true);
    try {
      const res = await fetch("/api/schedule/admin-reassign", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-user-email": loggedInUser?.user?.email || ""
        },
        body: JSON.stringify({
          date: adminReassignSession.date,
          time: adminReassignSession.time,
          fromPlayer: adminReassignSession.currentPlayer,
          toPlayer: newPlayer,
          slotIndex: slotIndex, // Pass slot index for multiple slot handling
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Admin reassignment failed");
      setAdminReassignModalOpen(false);
      setAdminReassignSession(null);
      setAdminReassignSelectedPlayer("");
      setAdminReassignConfirm(false);
      setAdminReassignWarn(false);
      await new Promise(r => setTimeout(r, 300)); // UX: allow modal to close
      // Refresh schedule data after successful reassignment
      if (onScheduleRefresh) {
        await onScheduleRefresh();
      }
    } catch (err: any) {
      setAdminReassignError(err.message || "Admin reassignment failed");
    } finally {
      setAdminReassignLoading(false);
    }
  }

  // Create filter items for the FilterBar
  const filterItems: FilterItem[] = [
    {
      id: 'showAll',
      type: 'toggle',
      label: 'Show All Sessions',
      value: showAll,
    },
    {
      id: 'showPast',
      type: 'toggle',
      label: 'Show Past Sessions',
      value: showPast,
    },
    {
      id: 'condensedMode',
      type: 'toggle',
      label: 'Condensed View',
      value: condensedMode,
    },
  ];

  const handleFilterChange = (filterId: string, value: any) => {
    switch (filterId) {
      case 'showAll':
        setShowAll(() => value);
        break;
      case 'showPast':
        setShowPast(() => value);
        break;
      case 'condensedMode':
        setCondensedMode(value);
        break;
    }
  };

  return (
    <>
      {loggedInUser ? (
        <>
          {/* <div className="mb-2"> */}
            <FilterBar
              title="Schedule Filters"
              filters={filterItems}
              onFilterChange={handleFilterChange}
              isExpanded={false}
            />
          {/* </div> */}
          {(scheduleLoading || scheduleTabLoading) ? (
            <div className="text-center text-gray-500 py-10">
              {scheduleTabLoading ? "Refreshing schedule..." : "Loading schedule..."}
            </div>
          ) : (
            <>
              {scheduleToDisplay.length === 0 ? (
                <div className="text-center text-gray-500">No games scheduled{showAll ? "." : " for you."}</div>
              ) : (
                scheduleToDisplay.map((game: any) => (
                  <ScheduleCard
                    key={game.id}
                    game={game}
                    userMapping={userMapping}
                    playerName={playerName}
                    allSlots={allSlots}
                    condensedMode={condensedMode}
                    slotActionLoading={slotActionLoading}
                    handleOfferSlot={handleOfferSlot}
                    handleRequestSwap={handleRequestSwap}
                    onReassignClick={handleReassignClick}
                    onClaimAvailableSlot={onClaimAvailableSlot}
                    adminMode={adminMode}
                    onAdminReassignClick={handleAdminReassignClick}
                    showTournamentFeatures={showTournamentFeatures}
                    tournamentData={tournamentData}
                    tournamentDataLoading={tournamentDataLoading}
                  />
                ))
              )}
            </>
          )}
        </>
      ) : (
        <div className="text-center text-gray-500 py-10">
          You need to log in to use the app.
        </div>
      )}
      {reassignSession && (
        <UnifiedReassignModal
          open={reassignModalOpen}
          onOpenChange={setReassignModalOpen}
          sessionInfo={reassignSession}
          userMapping={userMapping}
          onReassign={handleReassign}
          loading={reassignLoading}
          error={reassignError}
          selectedPlayer={reassignSelectedPlayer}
          warn={reassignWarn}
          onConfirm={() => setReassignConfirm(true)}
          onPlayerSelect={(player: string) => setReassignSelectedPlayer(player)}
          isPlayerEligible={true}
          isAdmin={false}
          slotCount={getPlayerSlotCount(reassignSession.date, reassignSession.time, reassignSession.currentPlayer)}
        />
      )}
      {adminReassignSession && (
        <UnifiedReassignModal
          open={adminReassignModalOpen}
          onOpenChange={setAdminReassignModalOpen}
          sessionInfo={adminReassignSession}
          userMapping={userMapping}
          onReassign={handleAdminReassign}
          loading={adminReassignLoading}
          error={adminReassignError}
          selectedPlayer={adminReassignSelectedPlayer}
          warn={adminReassignWarn}
          onConfirm={() => setAdminReassignConfirm(true)}
          onPlayerSelect={(player: string) => setAdminReassignSelectedPlayer(player)}
          isPlayerEligible={false}
          isAdmin={true}
          slotCount={getPlayerSlotCount(adminReassignSession.date, adminReassignSession.time, adminReassignSession.currentPlayer)}
          getPlayerValidationState={getPlayerValidationState}
        />
      )}
    </>
  );
};

export default ScheduleTab; 