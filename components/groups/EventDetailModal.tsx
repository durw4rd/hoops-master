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
  // Handle empty, invalid, or epoch dates as "always open"
  const getSignupStatus = () => {
    if (!event?.signupOpensAt || event.signupOpensAt.trim() === '') {
      return { isOpen: true, opensAt: null };
    }
    
    const signupDate = new Date(event.signupOpensAt);
    
    // Check for invalid date
    if (isNaN(signupDate.getTime())) {
      return { isOpen: true, opensAt: null };
    }
    
    // Check for epoch date (immediate signup - 1970-01-01 or very early dates)
    // Anything before year 2000 is treated as "always open"
    if (signupDate.getFullYear() < 2000) {
      return { isOpen: true, opensAt: null };
    }
    
    const now = new Date();
    return { 
      isOpen: signupDate <= now, 
      opensAt: signupDate 
    };
  };
  
  const { isOpen: isSignupOpen, opensAt: signupOpensAt } = getSignupStatus();
  
  const formatSignupTime = (date: Date | null) => {
    if (!date) return null;
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

              {/* Primary Action Buttons */}
              <div className="space-y-3">
                {!event.isAttending && availableSpots > 0 && isSignupOpen && (
                  <button
                    onClick={() => handleClaim()}
                    disabled={actionLoading === 'claim'}
                    className="w-full relative bg-[#7FFF00] text-[#1A1A1A] border-4 border-[#1A1A1A] font-graffiti text-xl py-4 px-6 shadow-[6px_6px_0_#1A1A1A] hover:shadow-[8px_8px_0_#1A1A1A] hover:translate-y-[-2px] active:shadow-[2px_2px_0_#1A1A1A] active:translate-y-[2px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                  >
                    {actionLoading === 'claim' ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <>
                        <span className="text-2xl">🏀</span>
                        <span>CLAIM SPOT</span>
                        <Check className="w-6 h-6" />
                      </>
                    )}
                  </button>
                )}
                
                {event.myAttendance?.status === 'confirmed' && (
                  <button
                    onClick={handleOffer}
                    disabled={actionLoading === 'offer'}
                    className="w-full bg-[#FF6B1A] text-white border-3 border-[#1A1A1A] font-graffiti text-lg py-3 px-5 shadow-[4px_4px_0_#1A1A1A] hover:shadow-[6px_6px_0_#1A1A1A] hover:translate-y-[-2px] active:shadow-[2px_2px_0_#1A1A1A] active:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {actionLoading === 'offer' ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Hand className="w-5 h-5" />
                        <span>OFFER MY SPOT</span>
                      </>
                    )}
                  </button>
                )}
                
                {event.myAttendance?.status === 'offered' && (
                  <button
                    onClick={handleRetract}
                    disabled={actionLoading === 'retract'}
                    className="w-full bg-white text-[#1A1A1A] border-3 border-[#1A1A1A] font-graffiti text-lg py-3 px-5 shadow-[4px_4px_0_#1A1A1A] hover:shadow-[6px_6px_0_#1A1A1A] hover:translate-y-[-2px] active:shadow-[2px_2px_0_#1A1A1A] active:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {actionLoading === 'retract' ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Undo2 className="w-5 h-5" />
                        <span>RETRACT OFFER</span>
                      </>
                    )}
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
                            className="bg-[#7FFF00] text-[#1A1A1A] border-2 border-[#1A1A1A] font-graffiti text-sm py-1.5 px-4 shadow-[3px_3px_0_#1A1A1A] hover:shadow-[4px_4px_0_#1A1A1A] active:shadow-[1px_1px_0_#1A1A1A] transition-all disabled:opacity-50"
                          >
                            {actionLoading === 'claim' ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              'CLAIM'
                            )}
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
