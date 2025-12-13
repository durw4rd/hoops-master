import SlotCard from "@/components/SlotCard";
import React, { useState, useMemo, useEffect, useRef } from "react";
import FilterBar, { FilterItem } from "@/components/ui/filter-bar";
import { compareSlotsByDateTime, getDayOfWeek, normalizeDate, isSessionInPast, shouldSlotBeExpired } from "@/lib/utils";
import { getStorageKey, saveToStorage, loadFromStorage } from "@/lib/persistence";

interface MarketplaceTabProps {
  allSlots: any[];
  availableSlots: any[];
  playerName?: string;
  schedule: any[];
  userMapping: Record<string, { email: string; color?: string; role?: string }>;
  slotActionLoading: string | null;
  acceptSwapLoading: string | null;
  handleRecallSlot: (slotId: string, actionId: string) => void;
  handleAcceptSwap: (slotId: string) => void;
  handleSettleSlot?: (slotId: string) => void;
  showInactiveSlots: boolean;
  setShowInactiveSlots: (v: (prev: boolean) => boolean) => void;
  slotsLoading: boolean;
  getPlayerColor: (name: string) => string;
  isEligibleForSwap: (slot: any) => boolean;
  onClaimClick: (slot: any, claimSessionId: string) => void;
  loggedInUser: any;
  adminMode?: boolean;
}

const MarketplaceTab: React.FC<MarketplaceTabProps> = ({
  allSlots,
  availableSlots,
  playerName,
  schedule,
  userMapping,
  slotActionLoading,
  acceptSwapLoading,
  handleRecallSlot,
  handleAcceptSwap,
  handleSettleSlot,
  showInactiveSlots,
  setShowInactiveSlots,
  slotsLoading,
  getPlayerColor,
  isEligibleForSwap,
  onClaimClick,
  loggedInUser,
  adminMode = false,
}) => {
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set(['all'])); // default to showing all slots
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set(['all']));

  // New player filtering states
  const [offeredByPlayers, setOfferedByPlayers] = useState<Set<string>>(new Set(['all']));
  const [claimedByPlayers, setClaimedByPlayers] = useState<Set<string>>(new Set(['all']));

  const [hasMounted, setHasMounted] = useState(false);

  // Set mounted state after hydration
  useEffect(() => {
    setHasMounted(true);
  }, []);



  // Load saved filter states on component mount (client-side only)
  useEffect(() => {
    if (hasMounted && loggedInUser?.user?.email) {
      const userId = loggedInUser.user.email;

      // Load selectedStatuses filter
      const selectedStatusesKey = getStorageKey(userId, 'available', 'selectedStatuses');
      const savedSelectedStatuses = loadFromStorage(selectedStatusesKey, ['all']);
      if (savedSelectedStatuses && Array.isArray(savedSelectedStatuses)) {
        setSelectedStatuses(new Set(savedSelectedStatuses));
      }

      // Load offeredByPlayers filter
      const offeredByPlayersKey = getStorageKey(userId, 'available', 'offeredByPlayers');
      const savedOfferedByPlayers = loadFromStorage(offeredByPlayersKey, ['all']);
      if (savedOfferedByPlayers && Array.isArray(savedOfferedByPlayers)) {
        setOfferedByPlayers(new Set(savedOfferedByPlayers));
      }

      // Load claimedByPlayers filter
      const claimedByPlayersKey = getStorageKey(userId, 'available', 'claimedByPlayers');
      const savedClaimedByPlayers = loadFromStorage(claimedByPlayersKey, ['all']);
      if (savedClaimedByPlayers && Array.isArray(savedClaimedByPlayers)) {
        setClaimedByPlayers(new Set(savedClaimedByPlayers));
      }

      // Load selectedEvents filter
      const selectedEventsKey = getStorageKey(userId, 'available', 'selectedEvents');
      const savedSelectedEvents = loadFromStorage(selectedEventsKey, ['all']);
      if (savedSelectedEvents && Array.isArray(savedSelectedEvents)) {
        setSelectedEvents(new Set(savedSelectedEvents));
      }
    }
  }, [hasMounted, loggedInUser?.user?.email]);

  // Save filter states when they change (client-side only)
  useEffect(() => {
    if (hasMounted && loggedInUser?.user?.email) {
      const userId = loggedInUser.user.email;

      const selectedStatusesKey = getStorageKey(userId, 'available', 'selectedStatuses');
      saveToStorage(selectedStatusesKey, Array.from(selectedStatuses));

      const offeredByPlayersKey = getStorageKey(userId, 'available', 'offeredByPlayers');
      saveToStorage(offeredByPlayersKey, Array.from(offeredByPlayers));

      const claimedByPlayersKey = getStorageKey(userId, 'available', 'claimedByPlayers');
      saveToStorage(claimedByPlayersKey, Array.from(claimedByPlayers));

      const selectedEventsKey = getStorageKey(userId, 'available', 'selectedEvents');
      saveToStorage(selectedEventsKey, Array.from(selectedEvents));
    }
  }, [hasMounted, selectedStatuses, selectedEvents, offeredByPlayers, claimedByPlayers, loggedInUser?.user?.email]);

  // Extract unique events from slots for filtering
  const uniqueEvents = useMemo(() => {
    const events = [...new Set(allSlots.map(slot => slot.Date))];
    return events.sort((a, b) => {
      // Sort by date (assuming DD.MM format)
      const [dayA, monthA] = a.split('.').map(Number);
      const [dayB, monthB] = b.split('.').map(Number);
      const dateA = new Date(new Date().getFullYear(), monthA - 1, dayA);
      const dateB = new Date(new Date().getFullYear(), monthB - 1, dayB);
      return dateA.getTime() - dateB.getTime();
    });
  }, [allSlots]);

  // Helper function to check if a date is in the past
  const isDateInPast = (dateStr: string) => {
    const [day, month] = dateStr.split('.').map(Number);
    const eventDate = new Date(new Date().getFullYear(), month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of day for comparison
    return eventDate < today;
  };



  // Enhanced filtering logic with multi-event filtering
  let baseSlots = [...allSlots]; // Start with all slots, let status filter handle the filtering

  // Client-side expiration check - mark slots as expired if they're more than 1 hour past their event time
  const expiredSlots: any[] = [];
  baseSlots = baseSlots.map((slot: any) => {
    if (slot.Status === 'offered' && shouldSlotBeExpired(slot.Date, slot.Time)) {
      expiredSlots.push(slot);
      return { ...slot, Status: 'expired' };
    }
    return slot;
  });

  // Update expired slots in the sheet if any were found
  useEffect(() => {
    if (expiredSlots.length > 0) {
      const updateExpiredSlots = async () => {
        try {
          const response = await fetch('/api/slots/update-expired', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ expiredSlots }),
          });

          const result = await response.json();
          if (result.success && result.updatedCount > 0) {
            console.log(`Updated ${result.updatedCount} slots to expired status`);
          }
        } catch (error) {
          console.error('Error updating expired slots:', error);
        }
      };

      updateExpiredSlots();
    }
  }, [expiredSlots.length]);

  // Event filtering - show slots for any selected event
  if (!selectedEvents.has('all')) {
    baseSlots = baseSlots.filter((slot: any) => selectedEvents.has(slot.Date));
  }

  // Player origin filtering (who offered the slot)
  if (!offeredByPlayers.has('all')) {
    baseSlots = baseSlots.filter((slot: any) =>
      slot.Player && offeredByPlayers.has(slot.Player)
    );
  }

  // Player destination filtering (who claimed the slot)
  if (!claimedByPlayers.has('all')) {
    baseSlots = baseSlots.filter((slot: any) => {
      // Show unclaimed slots if 'unclaimed' is selected
      if (claimedByPlayers.has('unclaimed') && slot.Status === 'offered') {
        return true;
      }
      // Show slots claimed by selected players
      if (slot.ClaimedBy && claimedByPlayers.has(slot.ClaimedBy)) {
        return true;
      }
      return false;
    });
  }

  // Status-based filtering
  baseSlots = baseSlots.filter((slot: any) => {
    // If "all" is selected, show everything
    if (selectedStatuses.has('all')) {
      return true;
    }
    
    // Check if the slot's status is in the selected statuses
    if (selectedStatuses.has(slot.Status)) {
      return true;
    }
    
    // Handle special cases for status mapping
    if (slot.Status === 'admin-reassigned' && selectedStatuses.has('reassigned')) {
      return true;
    }
    
    // Handle settled slots
    if (slot.Settled === 'yes' && selectedStatuses.has('settled')) {
      return true;
    }
    
    return false;
  });

  const filteredSlots = baseSlots;



  const handleFilterChange = (filterId: string, value: any) => {
    switch (filterId) {
      case 'eventFilter':
        setSelectedEvents(value);
        break;
      case 'offeredByPlayers':
        setOfferedByPlayers(value);
        break;
      case 'claimedByPlayers':
        setClaimedByPlayers(value);
        break;
      case 'statusFilter':
        setSelectedStatuses(value);
        break;
    }
  };

  return (
    <>
      {loggedInUser ? (
        <>
          <div className="mb-2">
            <FilterBar
              title="Marketplace Filters"
              filters={[
                {
                  id: 'eventFilter',
                  type: 'multi-select',
                  label: 'Filter by Dates',
                  value: selectedEvents,
                  options: [
                    { value: 'all', label: 'All events' },
                    ...uniqueEvents.map(event => ({
                      value: event,
                      label: `${event} (${getDayOfWeek(event)})${isDateInPast(event) ? ' (past)' : ''}`
                    }))
                  ],
                },
                {
                  id: 'offeredByPlayers',
                  type: 'multi-select',
                  label: 'Dropouts',
                  value: offeredByPlayers,
                  options: [
                    { value: 'all', label: 'All dropouts' },
                    ...Object.keys(userMapping).map(player => ({
                      value: player,
                      label: player
                    }))
                  ],
                },
                {
                  id: 'claimedByPlayers',
                  type: 'multi-select',
                  label: 'Claimants',
                  value: claimedByPlayers,
                  options: [
                    { value: 'all', label: 'All claimants' },
                    { value: 'unclaimed', label: 'Unclaimed' },
                    ...Object.keys(userMapping).map(player => ({
                      value: player,
                      label: player
                    }))
                  ],
                },
                {
                  id: 'statusFilter',
                  type: 'toggle-buttons',
                  label: 'Slot Status',
                  value: selectedStatuses,
                  options: [
                    { value: 'all', label: 'All' },
                    { value: 'offered', label: 'Available' },
                    { value: 'claimed', label: 'Claimed' },
                    { value: 'retracted', label: 'Retracted' },
                    { value: 'swapped', label: 'Swapped' },
                    { value: 'reassigned', label: 'Reassigned' },
                    { value: 'expired', label: 'Expired' },
                    { value: 'settled', label: 'Settled' }
                  ],
                },
              ]}
              onFilterChange={handleFilterChange}
              isExpanded={false}
            />
          </div>
          {slotsLoading ? (
            <div className="text-center text-gray-500 py-10">Loading marketplace...</div>
          ) : (
            (() => {
              const slotsArr = [...filteredSlots].sort(compareSlotsByDateTime);
              return (
                <div className="space-y-3">
                  {slotsArr.length === 0 ? (
                    <div className="text-center text-gray-500">
                      {(() => {
                        if (!selectedEvents.has('all')) {
                          return `No slots available for the selected events.`;
                        }
                        if (!offeredByPlayers.has('all') || !claimedByPlayers.has('all') || !selectedStatuses.has('all')) {
                          return `No slots match the selected filters. Try adjusting your filters.`;
                        }
                        return 'No slots available in the marketplace.';
                      })()}
                    </div>
                  ) : (
                    slotsArr.map((slot: any, idx: number) => {
                      let isUserInSession = false;
                      if (playerName) {
                        for (const game of schedule) {
                          if (normalizeDate(game.date) === normalizeDate(slot.Date)) {
                            for (const session of game.sessions) {
                              if (session.time.trim() === slot.Time.trim()) {
                                if (session.players.some((p: string) => p.toLowerCase() === playerName.toLowerCase())) {
                                  isUserInSession = true;
                                }
                              }
                            }
                          }
                        }
                      }
                      const isOwner = !!(playerName && slot.Player === playerName);
                      const isInactive = slot.Status !== 'offered';
                      const acceptSwapEligible = slot.SwapRequested === 'yes' && slot.Status === 'offered' && isEligibleForSwap(slot);
                      return (
                        <SlotCard
                          key={idx}
                          slot={slot}
                          idx={idx}
                          userMapping={userMapping}
                          slotActionLoading={slotActionLoading}
                          acceptSwapLoading={acceptSwapLoading}
                          handleRecallSlot={handleRecallSlot}
                          handleAcceptSwap={handleAcceptSwap}
                          handleSettleSlot={handleSettleSlot}
                          isOwner={isOwner}
                          isInactive={isInactive}
                          isUserInSession={isUserInSession}
                          getPlayerColor={getPlayerColor}
                          acceptSwapEligible={acceptSwapEligible}
                          onClaimClick={onClaimClick}
                          adminMode={adminMode}
                          onPlayerNameClick={(playerName, type) => {
                            if (type === 'offered') {
                              setOfferedByPlayers(new Set([playerName]));
                            } else if (type === 'claimed') {
                              setClaimedByPlayers(new Set([playerName]));
                            }
                          }}
                        />
                      );
                    })
                  )}
                </div>
              );
            })()
          )}
        </>
      ) : (
        <div className="text-center text-gray-500 py-10">
          You need to log in to use the app.
        </div>
      )}
    </>
  );
};

export default MarketplaceTab; 