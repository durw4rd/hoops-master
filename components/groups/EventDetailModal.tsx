"use client";

import { useState, useEffect, useCallback } from "react";
import { EventAttendee } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Clock, 
  MapPin, 
  Users, 
  DollarSign,
  Loader2,
  Check,
  Hand,
  Undo2,
  Lock,
} from "lucide-react";

interface EventDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  eventId: string;
  userEmail: string;
  isGroupAdmin: boolean;
  onEventUpdated: () => void;
}

interface EventDetail {
  eventId: string;
  date: string;
  startTime: string;
  endTime: string;
  totalSpots: number;
  slotCost: number;
  location?: string;
  description?: string;
  status: string;
  signupOpensAt: string;
  attendees: EventAttendee[];
  isAttending: boolean;
  myAttendance: EventAttendee | null;
}

export default function EventDetailModal({
  open,
  onOpenChange,
  groupId,
  eventId,
  userEmail,
  isGroupAdmin,
  onEventUpdated,
}: EventDetailModalProps) {
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchEvent = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/events/${eventId}`);
      if (res.ok) {
        const data = await res.json();
        setEvent(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch event:', err);
    } finally {
      setLoading(false);
    }
  }, [groupId, eventId]);

  useEffect(() => {
    if (open) {
      fetchEvent();
    }
  }, [open, fetchEvent]);

  const handleClaim = async (attendeeId?: string) => {
    setActionLoading('claim');
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/events/${eventId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attendeeId ? { attendeeId } : {}),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }

      fetchEvent();
      onEventUpdated();
    } catch (err) {
      setError('Failed to claim spot');
    } finally {
      setActionLoading(null);
    }
  };

  const handleOffer = async () => {
    setActionLoading('offer');
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/events/${eventId}/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }

      fetchEvent();
      onEventUpdated();
    } catch (err) {
      setError('Failed to offer spot');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetract = async () => {
    setActionLoading('retract');
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/events/${eventId}/retract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }

      fetchEvent();
      onEventUpdated();
    } catch (err) {
      setError('Failed to retract offer');
    } finally {
      setActionLoading(null);
    }
  };

  const confirmedAttendees = event?.attendees.filter(a => a.status === 'confirmed') || [];
  const offeredSpots = event?.attendees.filter(a => a.status === 'offered') || [];
  const availableSpots = event ? event.totalSpots - confirmedAttendees.length : 0;

  // Check if signup is open
  const signupOpensAt = event ? new Date(event.signupOpensAt) : null;
  const now = new Date();
  const isSignupOpen = signupOpensAt ? signupOpensAt <= now : true;
  
  const formatSignupTime = (date: Date) => {
    // If it's the epoch (immediate), return null
    if (date.getTime() < 1000000) return null;
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#F2EFE9] border-4 border-[#1A1A1A] max-w-lg max-h-[85vh] overflow-y-auto mx-2 sm:mx-auto rounded-none shadow-[8px_8px_0_#1A1A1A]">
        <DialogHeader>
          <DialogTitle className="font-graffiti text-2xl text-[#FF5A00]">
            {loading ? 'Loading...' : event ? formatDate(event.date) : 'Game Details'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Game details and attendance management
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4 py-4">
            <div className="animate-pulse space-y-3">
              <div className="h-8 w-48 bg-[#1A1A1A]/10 rounded" />
              <div className="h-6 w-32 bg-[#1A1A1A]/10 rounded" />
              <div className="grid grid-cols-2 gap-2 mt-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-12 bg-[#1A1A1A]/10 rounded" />
                ))}
              </div>
            </div>
          </div>
        ) : event ? (
          <>
            {/* Event Details */}
            <div className="space-y-4 mt-2">
              {/* Info Badges */}
              <div className="flex flex-wrap gap-2">
                <span className="badge-blue flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {event.startTime} - {event.endTime}
                </span>
                {event.location && (
                  <span className="badge-orange flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {event.location}
                  </span>
                )}
                <span className="badge-green flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {confirmedAttendees.length}/{event.totalSpots}
                </span>
                {event.slotCost > 0 && (
                  <span className="bg-[#FFD700] text-[#1A1A1A] border-2 border-[#1A1A1A] font-graffiti px-2 py-0.5 text-xs flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    {event.slotCost.toFixed(2)}
                  </span>
                )}
              </div>

              {/* Signup Status */}
              {!isSignupOpen && signupOpensAt && formatSignupTime(signupOpensAt) && (
                <div className="bg-[#FFD700] border-2 border-[#1A1A1A] p-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Lock className="w-4 h-4 text-[#1A1A1A]" />
                    <p className="font-graffiti text-[#1A1A1A]">
                      Signup opens {formatSignupTime(signupOpensAt)}
                    </p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2">
                {!event.isAttending && availableSpots > 0 && isSignupOpen && (
                  <button
                    onClick={() => handleClaim()}
                    disabled={actionLoading === 'claim'}
                    className="sticker-btn-green flex items-center gap-2"
                  >
                    {actionLoading === 'claim' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    Claim Spot
                  </button>
                )}
                
                {event.myAttendance?.status === 'confirmed' && (
                  <button
                    onClick={handleOffer}
                    disabled={actionLoading === 'offer'}
                    className="sticker-btn-outline flex items-center gap-2"
                  >
                    {actionLoading === 'offer' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Hand className="w-4 h-4" />
                    )}
                    Offer My Spot
                  </button>
                )}
                
                {event.myAttendance?.status === 'offered' && (
                  <button
                    onClick={handleRetract}
                    disabled={actionLoading === 'retract'}
                    className="sticker-btn-outline flex items-center gap-2"
                  >
                    {actionLoading === 'retract' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Undo2 className="w-4 h-4" />
                    )}
                    Retract Offer
                  </button>
                )}
              </div>

              {error && (
                <div className="p-2 bg-[#FF5A00]/10 border-2 border-[#FF5A00]">
                  <p className="text-sm text-[#FF5A00] font-body">{error}</p>
                </div>
              )}

              {/* Offered Spots */}
              {offeredSpots.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-graffiti text-lg text-[#FF5A00]">
                    Available Spots ({offeredSpots.length})
                  </h3>
                  <div className="space-y-2">
                    {offeredSpots.map((attendee, index) => (
                      <div 
                        key={attendee.attendeeId} 
                        className="marker-card bg-[#FF5A00]/10 p-3 flex items-center justify-between"
                        style={{ transform: `rotate(${index % 2 === 0 ? -0.3 : 0.3}deg)` }}
                      >
                        <span className="font-marker text-[#FF5A00]">
                          {attendee.userEmail.split('@')[0]}&apos;s spot
                        </span>
                        {!event.isAttending && isSignupOpen && (
                          <button
                            onClick={() => handleClaim(attendee.attendeeId)}
                            disabled={actionLoading === 'claim'}
                            className="sticker-btn text-sm py-1 px-3"
                          >
                            Claim
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Confirmed Attendees */}
              <div className="space-y-2">
                <h3 className="font-graffiti text-lg text-[#0084FF]">
                  Playing ({confirmedAttendees.length}/{event.totalSpots})
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {confirmedAttendees.map((attendee, index) => (
                    <div 
                      key={attendee.attendeeId} 
                      className={`marker-card p-2 ${
                        attendee.userEmail === userEmail 
                          ? 'bg-[#96E600] border-[#1A1A1A]' 
                          : 'bg-white'
                      }`}
                      style={{ transform: `rotate(${index % 2 === 0 ? -0.5 : 0.5}deg)` }}
                    >
                      <span className="font-marker text-sm text-[#1A1A1A] truncate block">
                        {attendee.userEmail.split('@')[0]}
                        {attendee.userEmail === userEmail && (
                          <span className="text-[#1A1A1A]/60 ml-1">(you)</span>
                        )}
                      </span>
                    </div>
                  ))}
                  
                  {/* Empty spots */}
                  {Array.from({ length: availableSpots }).map((_, i) => (
                    <div 
                      key={`empty-${i}`} 
                      className="marker-card p-2 border-dashed border-[#1A1A1A]/30 bg-white/50"
                      style={{ transform: `rotate(${i % 2 === 0 ? -0.3 : 0.3}deg)` }}
                    >
                      <span className="text-sm text-[#1A1A1A]/30 font-body">Open</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="py-8 text-center">
            <p className="font-graffiti text-[#1A1A1A]/50">Failed to load game details</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
