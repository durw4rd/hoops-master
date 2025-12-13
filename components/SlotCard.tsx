import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useMemo } from "react";
import { getDayOfWeek, isSessionInPast } from "@/lib/utils";
import { getOptimizedProfileImage, handleProfileImageError } from "@/lib/utils";
import { Euro } from "lucide-react";

interface SlotCardProps {
  slot: any;
  idx: number;
  userMapping: Record<string, { email: string; color?: string; role?: string }>;
  slotActionLoading: string | null;
  acceptSwapLoading: string | null;
  handleRecallSlot: (slotId: string, actionId: string) => void;
  handleAcceptSwap: (slotId: string) => void;
  handleSettleSlot?: (slotId: string) => void;
  isOwner: boolean;
  isInactive: boolean;
  isUserInSession: boolean;
  getPlayerColor: (name: string) => string;
  acceptSwapEligible: boolean;
  onClaimClick: (slot: any, claimSessionId: string) => void;
  adminMode?: boolean;
  onPlayerNameClick?: (playerName: string, type: 'offered' | 'claimed') => void;
}

// Utility function to get comprehensive status information
const getStatusInfo = (slot: any) => {
  // Check if slot is settled (column J)
  const isSettled = slot.Settled === 'yes';
  
  switch (slot.Status) {
    case 'offered':
      if (slot.SwapRequested === 'yes') {
        return { 
          badge: 'Swap Offer', 
          color: 'blue', 
          details: null,
          detailsType: null,
          detailsPlayer: null,
          borderColor: 'border-l-blue-400',
          isSettled
        };
      } else {
        return { 
          badge: 'Up For Grabs', 
          color: 'yellow', 
          details: null,
          detailsType: null,
          detailsPlayer: null,
          borderColor: 'border-l-yellow-400',
          isSettled
        };
      }
    case 'claimed':
      return { 
        badge: 'Claimed', 
        color: 'green', 
        details: slot.ClaimedBy ? `by ${slot.ClaimedBy}` : null,
        detailsType: 'by',
        detailsPlayer: slot.ClaimedBy,
        borderColor: 'border-l-green-400',
        isSettled
      };
    case 'retracted':
      return { 
        badge: 'Retracted', 
        color: 'gray', 
        details: null,
        detailsType: null,
        detailsPlayer: null,
        borderColor: 'border-l-gray-400',
        isSettled
      };
    case 'reassigned':
      return { 
        badge: 'Reassigned', 
        color: 'blue', 
        details: slot.ClaimedBy ? `to ${slot.ClaimedBy}` : null,
        detailsType: 'to',
        detailsPlayer: slot.ClaimedBy,
        borderColor: 'border-l-blue-400',
        isSettled
      };
    case 'admin-reassigned':
      return { 
        badge: 'Admin Reassigned', 
        color: 'red', 
        details: slot.ClaimedBy ? `to ${slot.ClaimedBy}` : null,
        detailsType: 'to',
        detailsPlayer: slot.ClaimedBy,
        borderColor: 'border-l-red-400',
        isSettled
      };
    case 'expired':
      return { 
        badge: 'Expired', 
        color: 'gray', 
        details: null,
        detailsType: null,
        detailsPlayer: null,
        borderColor: 'border-l-gray-400',
        isSettled
      };
    default:
      return { 
        badge: slot.Status || 'Unknown', 
        color: 'gray', 
        details: null,
        detailsType: null,
        detailsPlayer: null,
        borderColor: 'border-l-gray-400',
        isSettled
      };
  }
};

// Utility function to format timestamp
const formatTimestamp = (timestamp: string) => {
  if (!timestamp) return null;
  try {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return null;
  }
};

// Utility function to get badge color classes
const getBadgeColorClasses = (color: string) => {
  switch (color) {
    case 'yellow':
      return 'bg-yellow-200 text-yellow-900';
    case 'green':
      return 'bg-green-200 text-green-900';
    case 'blue':
      return 'bg-blue-200 text-blue-900';
    case 'red':
      return 'bg-red-200 text-red-900';
    case 'gray':
      return 'bg-gray-200 text-gray-900';
    default:
      return 'bg-gray-200 text-gray-900';
  }
};

export default function SlotCard({
  slot,
  idx,
  userMapping,
  slotActionLoading,
  acceptSwapLoading,
  handleRecallSlot,
  handleAcceptSwap,
  handleSettleSlot,
  isOwner,
  isInactive,
  isUserInSession,
  getPlayerColor,
  acceptSwapEligible,
  onClaimClick,
  adminMode = false,
  onPlayerNameClick,
}: SlotCardProps) {
  const statusInfo = getStatusInfo(slot);
  const formattedTimestamp = formatTimestamp(slot.Timestamp);

  return (
    <div className="relative">
      <Card
        key={idx}
        className={`border-l-4 ${slot.Status === 'offered' ? '' : statusInfo.borderColor}`}
        style={slot.Status === 'offered' ? {
          borderLeftColor: getPlayerColor(slot.Player),
          background: `linear-gradient(90deg, ${getPlayerColor(slot.Player)}11 0%, transparent 100%)` // subtle tint
        } : slot.Status === 'admin-reassigned' ? {
          background: `linear-gradient(90deg, #fee2e2 0%, transparent 100%)` // admin red tint
        } : {}}
      >
      <CardHeader className="pb-2 flex flex-row items-start justify-between">
        <CardTitle className="text-md flex items-center gap-2">
          <span>{slot.Date}</span>
          <span className="text-gray-400">({getDayOfWeek(slot.Date)})</span>
          <span className="text-gray-400">/</span>
          <span>{slot.Time}</span>
        </CardTitle>
        <div className="flex flex-col gap-1 items-end">
          {isOwner && slot.Status === 'offered' && (
            <Badge className="bg-yellow-200 text-yellow-900">Your Slot</Badge>
          )}
          <Badge className={getBadgeColorClasses(statusInfo.color)}>
            {statusInfo.badge}
          </Badge>
          {/* Only show 'Already in!' badge if user is in the session, it's not their own offer, and the slot is still offered */}
          {!isOwner && isUserInSession && slot.Status === 'offered' && (
            <Badge className="bg-orange-500 text-white">Already in!</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Avatar className="w-6 h-6">
            <AvatarImage
              src={getOptimizedProfileImage(slot.Player)}
              onError={(e) => handleProfileImageError(e, slot.Player)}
            />
            <AvatarFallback className="text-xs">
              {slot.Player.split(" ").map((n: string) => n[0]).join("")}
            </AvatarFallback>
          </Avatar>
          {onPlayerNameClick ? (
            <button
              onClick={() => onPlayerNameClick(slot.Player, 'offered')}
              className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
            >
              {isOwner ? "You" : slot.Player.split(" ")[0]}
            </button>
          ) : (
            <span className="text-sm font-medium">
              {isOwner ? "You" : slot.Player.split(" ")[0]}
            </span>
          )}
        </div>
        
        {/* Status details section */}
        {statusInfo.details && (
          <div className="text-xs text-gray-600 mt-1">
            {statusInfo.detailsType && statusInfo.detailsPlayer && onPlayerNameClick ? (
              <>
                {statusInfo.detailsType}{' '}
                <button
                  onClick={() => onPlayerNameClick(statusInfo.detailsPlayer, 'claimed')}
                  className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-medium"
                >
                  {statusInfo.detailsPlayer}
                </button>
              </>
            ) : (
              statusInfo.details
            )}
          </div>
        )}
        
        {/* Timestamp information */}
        {formattedTimestamp && (
          <div className="text-xs text-gray-500 mt-1">
            Last updated: {formattedTimestamp}
          </div>
        )}
        
        {/* Swap offer information */}
        {slot.SwapRequested === 'yes' ? (
          <div className="flex flex-col gap-1 mb-2">
            <div className="text-xs text-blue-900">
              Wants to swap for: <b>{slot.RequestedDate} / {slot.RequestedTime}</b>
            </div>
          </div>
        ) : slot.Status === 'offered' && (
          <Badge className="bg-yellow-200 text-yellow-900 mb-2">Up For Grabs</Badge>
        )}
        
        {/* Recall button for owners */}
        {isOwner && slot.Status === 'offered' && !isSessionInPast(slot.Date) && slot.Status !== 'expired' && (
          <Button
            size="sm"
            variant="destructive"
            disabled={slotActionLoading === `available-${idx}`}
            onClick={() => handleRecallSlot(slot.ID, `recall-${idx}`)}
          >
            {slotActionLoading === `recall-${idx}` ? "Recalling..." : "Recall Slot"}
          </Button>
        )}
        
        {/* For swap requests, show Accept Swap button if user is eligible */}
        {slot.SwapRequested === 'yes' && slot.Status === 'offered' && acceptSwapEligible && !isSessionInPast(slot.Date) && slot.Status !== 'expired' && (
          <Button
            size="sm"
            variant="default"
            disabled={acceptSwapLoading === slot.ID}
            onClick={() => handleAcceptSwap(slot.ID)}
          >
            {acceptSwapLoading === slot.ID ? 'Accepting...' : 'Accept swap'}
          </Button>
        )}
        
        {/* Claim button for non-owners, only for offered slots */}
        {!isOwner && slot.Status === 'offered' && slot.SwapRequested !== 'yes' && !isSessionInPast(slot.Date) && slot.Status !== 'expired' && (
          <Button
            size="sm"
            variant="default"
            disabled={slotActionLoading === `available-${idx}`}
            onClick={() => onClaimClick(slot, `available-${idx}`)}
          >
            {slotActionLoading === `available-${idx}` ? "Claiming..." : `Claim ${slot.Player.split(' ')[0]}'s Slot`}
          </Button>
        )}
        
        {/* Settle button for eligible slots */}
        {handleSettleSlot && ['claimed', 'reassigned', 'admin-reassigned'].includes(slot.Status) && slot.SwapRequested !== 'yes' && isSessionInPast(slot.Date) && (isOwner || adminMode) && (
          <Button
            size="sm"
            variant={statusInfo.isSettled ? "outline" : "secondary"}
            className={statusInfo.isSettled ? "" : "bg-green-600 hover:bg-green-700 text-white"}
            onClick={() => handleSettleSlot(slot.ID)}
          >
            {statusInfo.isSettled ? "Mark as Unsettled" : "Mark as Settled"}
          </Button>
        )}
      </CardContent>
    </Card>
      
      {/* Settled overlay */}
      {statusInfo.isSettled && (
        <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center pointer-events-none">
          <div className="bg-green-600 text-white px-3 py-1 rounded-full flex items-center gap-2 text-sm font-medium">
            <Euro className="w-4 h-4" />
            SETTLED
          </div>
        </div>
      )}
    </div>
  );
} 