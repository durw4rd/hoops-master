import React, { useState, useMemo, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, UserCheck } from "lucide-react";

interface UnifiedReassignModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionInfo: { date: string; time: string; currentPlayer: string; slotIndex?: number };
  userMapping: Record<string, { email: string; color?: string; role?: string }>;
  onReassign: (newPlayer: string, slotIndex?: number) => Promise<void>;
  loading: boolean;
  error: string | null;
  selectedPlayer: string;
  warn: boolean;
  onConfirm: () => void;
  onPlayerSelect: (player: string) => void;
  // Context determines behavior
  isPlayerEligible: boolean;
  isAdmin: boolean;
  slotCount?: number;
  // New validation props
  getPlayerValidationState?: (date: string, time: string, player: string) => {
    isValid: boolean;
    message: string | null;
    type: 'error' | 'warning' | 'none';
  };
}

const UnifiedReassignModal: React.FC<UnifiedReassignModalProps> = ({
  open,
  onOpenChange,
  sessionInfo,
  userMapping,
  onReassign,
  loading,
  error,
  selectedPlayer,
  warn,
  onConfirm,
  onPlayerSelect,
  isPlayerEligible,
  isAdmin,
  slotCount,
  getPlayerValidationState,
}) => {
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Determine modal behavior based on context
  const getModalBehavior = () => {
    if (isPlayerEligible) {
      return 'PLAYER_REASSIGN';
    } else if (isAdmin) {
      return 'ADMIN_REASSIGN';
    } else {
      return 'NO_PERMISSION';
    }
  };

  const behavior = getModalBehavior();

  // Don't render if no permission
  if (behavior === 'NO_PERMISSION') {
    return null;
  }

  // Reset confirmed state when modal opens
  useEffect(() => {
    if (open) {
      setConfirmed(false);
    }
  }, [open]);

  // List of player names except the current player
  const playerNames = useMemo(
    () => Object.keys(userMapping).filter(name => name !== sessionInfo.currentPlayer),
    [userMapping, sessionInfo.currentPlayer]
  );

  // Filtered list based on search
  const filteredNames = useMemo(
    () => playerNames.filter(name => name.toLowerCase().includes(search.toLowerCase())),
    [playerNames, search]
  );

  // Keep input in sync with selectedPlayer
  useEffect(() => {
    if (selectedPlayer) setSearch(selectedPlayer);
    // Reset confirmed state when selected player changes
    setConfirmed(false);
  }, [selectedPlayer]);

  const handleSelect = (name: string) => {
    setSearch(name);
    setDropdownOpen(false);
    inputRef.current?.blur();
    onPlayerSelect(name);
  };

  const handleInputFocus = () => {
    setDropdownOpen(true);
    setSearch("");
  };

  const handleClear = () => {
    setSearch("");
    setDropdownOpen(true);
    inputRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setDropdownOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlayer) return;
    
    // Use new validation system if available
    if (getPlayerValidationState) {
      const validation = getPlayerValidationState(sessionInfo.date, sessionInfo.time, selectedPlayer);
      if (!validation.isValid) {
        return; // Don't proceed if validation fails
      }
    } else {
      // Fallback to old warning system
      if (warn && !confirmed) {
        setConfirmed(true);
        onConfirm();
        return;
      }
    }
    
    // Proceed with reassignment
    await onReassign(selectedPlayer, sessionInfo.slotIndex);
  };

  const isPlayerReassign = behavior === 'PLAYER_REASSIGN';
  const isAdminReassign = behavior === 'ADMIN_REASSIGN';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isAdminReassign && <Shield className="w-5 h-5 text-red-600" />}
            {isPlayerReassign && <UserCheck className="w-5 h-5 text-blue-600" />}
            {isPlayerReassign ? 'Reassign Slot' : 'Admin Reassignment'}
          </DialogTitle>
          <DialogDescription>
            {isPlayerReassign 
              ? `Reassign your slot for ${sessionInfo.date} / ${sessionInfo.time} to another player${slotCount && slotCount > 1 ? ` (you have ${slotCount} slots in this session)` : ''}`
              : `Admin reassignment for ${sessionInfo.date} / ${sessionInfo.time} session${slotCount && slotCount > 1 ? ` (${sessionInfo.currentPlayer} has ${slotCount} slots)` : ''}`
            }
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="space-y-3">
            {isAdminReassign && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <Shield className="w-4 h-4 text-red-600" />
                <span className="text-sm text-red-800 font-medium">
                  Admin Action: Reassign slot for <b>{sessionInfo.date} / {sessionInfo.time}</b>
                </span>
              </div>
            )}
            
            <div>
              <div className="mb-2 text-sm text-gray-700">
                {isPlayerReassign ? (
                  <>Reassign slot for <b>{sessionInfo.date} / {sessionInfo.time}</b> from <b>{sessionInfo.currentPlayer}</b> to:</>
                ) : (
                  <>Reassign <b>{sessionInfo.currentPlayer}</b>'s slot for <b>{sessionInfo.date} / {sessionInfo.time}</b> to:</>
                )}
              </div>
              <div className="relative">
                <Input
                  ref={inputRef}
                  placeholder="Search player..."
                  value={selectedPlayer || search}
                  onFocus={handleInputFocus}
                  onChange={handleInputChange}
                  className="w-full"
                />
                {selectedPlayer && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClear}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                  >
                    ×
                  </Button>
                )}
                {dropdownOpen && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                    {filteredNames.length === 0 ? (
                      <div className="px-4 py-2 text-sm text-gray-500">No players found</div>
                    ) : (
                      filteredNames.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => handleSelect(name)}
                          className="w-full px-4 py-2 text-left hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                        >
                          {name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {selectedPlayer && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <UserCheck className="w-4 h-4 text-blue-600" />
                <span className="text-sm text-blue-800">
                  {isPlayerReassign ? (
                    <>Will reassign your slot to <b>{selectedPlayer}</b></>
                  ) : (
                    <>Will reassign <b>{sessionInfo.currentPlayer}</b>'s slot to <b>{selectedPlayer}</b></>
                  )}
                </span>
              </div>
            )}

            {selectedPlayer && getPlayerValidationState && (
              (() => {
                const validation = getPlayerValidationState(sessionInfo.date, sessionInfo.time, selectedPlayer);
                if (validation.type === 'error') {
                  return (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <Shield className="w-4 h-4 text-red-600" />
                      <span className="text-sm text-red-800">{validation.message}</span>
                    </div>
                  );
                } else if (validation.type === 'warning') {
                  return (
                    <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <Shield className="w-4 h-4 text-yellow-600" />
                      <span className="text-sm text-yellow-800">{validation.message}</span>
                    </div>
                  );
                }
                return null;
              })()
            )}

            {warn && !getPlayerValidationState && (
              <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <Shield className="w-4 h-4 text-yellow-600" />
                <span className="text-sm text-yellow-800">
                  Warning: This action cannot be undone. The slot will be reassigned immediately.
                </span>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <span className="text-sm text-red-800">{error}</span>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={
                !selectedPlayer || 
                loading || 
                (getPlayerValidationState && selectedPlayer ? !getPlayerValidationState(sessionInfo.date, sessionInfo.time, selectedPlayer).isValid : false)
              }
              className={isAdminReassign ? "bg-red-600 hover:bg-red-700" : ""}
            >
              {loading ? "Reassigning..." : (isPlayerReassign ? "Reassign Slot" : "Admin Reassign")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default UnifiedReassignModal; 