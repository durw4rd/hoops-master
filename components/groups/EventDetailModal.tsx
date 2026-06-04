"use client";

import { useState, useEffect, useCallback } from "react";
import { EventAttendee, WaitlistEntry } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import EditEventModal from "./EditEventModal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { 
  Clock, 
  MapPin, 
  Users, 
  Euro,
  Loader2,
  Check,
  Hand,
  Undo2,
  Lock,
  LogOut,
  ListPlus,
  Pencil,
  Trash2,
  Crown,
  Star,
} from "lucide-react";
import { isCapo as isCapoRole, isCrewManager } from "@/lib/roles";
import PlayerAvatar from "@/components/PlayerAvatar";

interface EventDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  eventId: string;
  userEmail: string;
  /** Capo or King — can assign players, edit, and delete the event. */
  canManage: boolean;
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
  assignmentMode: string;
  signupOpensAt: string;
  attendees: EventAttendee[];
  waitlist: WaitlistEntry[];
  availableSpots: number;
  isAttending: boolean;
  myAttendance: EventAttendee | null;
  myWaitlistPosition: number | null;
}

export default function EventDetailModal({
  open,
  onOpenChange,
  groupId,
  eventId,
  userEmail,
  canManage,
  onEventUpdated,
}: EventDetailModalProps) {
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<{ userEmail: string; displayName: string; groupRole: string; pieceUrl?: string }[]>([]);
  const [assignEmail, setAssignEmail] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<Record<string, string>>({});

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

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${groupId}/members`);
      if (res.ok) {
        const data = await res.json();
        const list = (data.data?.members || []).map(
          (m: { userEmail: string; displayName: string; groupRole?: string; pieceUrl?: string }) => ({
            userEmail: m.userEmail,
            displayName: m.displayName,
            groupRole: m.groupRole ?? 'member',
            pieceUrl: m.pieceUrl,
          })
        );
        setMembers(list);
      }
    } catch (err) {
      console.error('Failed to fetch members:', err);
    }
  }, [groupId]);

  useEffect(() => {
    if (open) {
      fetchEvent();
      fetchMembers();
    }
  }, [open, fetchEvent, fetchMembers]);

  const handleDelete = async () => {
    setActionLoading('delete');
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/events/${eventId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      setConfirmDeleteOpen(false);
      onEventUpdated();
      onOpenChange(false);
    } catch {
      setError('Failed to delete game');
    } finally {
      setActionLoading(null);
    }
  };

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

  const runAction = async (key: string, path: string, method: string = 'POST') => {
    setActionLoading(key);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/events/${eventId}/${path}`, {
        method,
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
      setError(`Failed to ${key}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRelease = () => runAction('release', 'release');
  const handleJoinWaitlist = () => runAction('waitlist', 'waitlist', 'POST');
  const handleLeaveWaitlist = () => runAction('waitlist', 'waitlist', 'DELETE');

  const handleAssign = async () => {
    if (!assignEmail) return;
    setActionLoading('assign');
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/events/batch-assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventIds: [eventId], userEmails: [assignEmail] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      setAssignEmail("");
      fetchEvent();
      onEventUpdated();
    } catch (err) {
      setError('Failed to assign player');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReassign = async (attendeeId: string) => {
    const toUserEmail = reassignTarget[attendeeId];
    if (!toUserEmail) return;
    setActionLoading(`reassign-${attendeeId}`);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/events/${eventId}/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeId, toUserEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      setReassignTarget((prev) => {
        const next = { ...prev };
        delete next[attendeeId];
        return next;
      });
      fetchEvent();
      onEventUpdated();
    } catch {
      setError('Failed to reassign spot');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnassign = async (attendeeId: string) => {
    setActionLoading(`unassign-${attendeeId}`);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/events/${eventId}/unassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      fetchEvent();
      onEventUpdated();
    } catch {
      setError('Failed to remove player');
    } finally {
      setActionLoading(null);
    }
  };

  // Crew-role lookup so we can flag Capos (crown) and Kings (star) in player lists.
  const roleByEmail = new Map(members.map((m) => [m.userEmail, m.groupRole]));
  // Piece (profile picture) lookup so player lists show each baller's avatar.
  const pieceByEmail = new Map(members.map((m) => [m.userEmail, m.pieceUrl]));
  const renderRoleIcon = (email: string) => {
    const role = roleByEmail.get(email);
    if (!role) return null;
    if (isCapoRole(role)) {
      return <Crown className="w-3.5 h-3.5 text-[#FFD700] flex-shrink-0" aria-label="Crew Capo" />;
    }
    if (isCrewManager(role)) {
      return <Star className="w-3.5 h-3.5 text-[#FF6B1A] flex-shrink-0" aria-label="King" />;
    }
    return null;
  };

  const confirmedAttendees = event?.attendees.filter(a => a.status === 'confirmed') || [];
  const offeredSpots = event?.attendees.filter(a => a.status === 'offered') || [];
  // Occupancy includes offered spots (still held until claimed).
  const availableSpots = event ? event.availableSpots : 0;
  const isFull = availableSpots <= 0;
  const waitlist = event?.waitlist || [];

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
    <>
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
                    <Euro className="w-3 h-3" />
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
                
                {/* Join waitlist when the event is full */}
                {!event.isAttending && isFull && isSignupOpen && event.myWaitlistPosition === null && (
                  <button
                    onClick={handleJoinWaitlist}
                    disabled={actionLoading === 'waitlist'}
                    className="w-full bg-[#0084FF] text-white border-3 border-[#1A1A1A] font-graffiti text-lg py-3 px-5 shadow-[4px_4px_0_#1A1A1A] hover:shadow-[6px_6px_0_#1A1A1A] hover:translate-y-[-2px] active:shadow-[2px_2px_0_#1A1A1A] active:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {actionLoading === 'waitlist' ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <ListPlus className="w-5 h-5" />
                        <span>GET ON THE BENCH</span>
                      </>
                    )}
                  </button>
                )}

                {/* On the waitlist */}
                {event.myWaitlistPosition !== null && (
                  <div className="space-y-2">
                    <div className="bg-[#0084FF]/10 border-2 border-[#0084FF] p-3 text-center font-graffiti text-[#0084FF]">
                      You&apos;re #{event.myWaitlistPosition} on the bench
                    </div>
                    <button
                      onClick={handleLeaveWaitlist}
                      disabled={actionLoading === 'waitlist'}
                      className="w-full bg-white text-[#1A1A1A] border-3 border-[#1A1A1A] font-graffiti text-base py-2.5 px-5 shadow-[3px_3px_0_#1A1A1A] hover:shadow-[5px_5px_0_#1A1A1A] active:shadow-[1px_1px_0_#1A1A1A] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {actionLoading === 'waitlist' ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <LogOut className="w-5 h-5" />
                          <span>OFF THE BENCH</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {event.myAttendance?.status === 'confirmed' && (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={handleOffer}
                        disabled={actionLoading === 'offer'}
                        className="bg-[#FF6B1A] text-white border-3 border-[#1A1A1A] font-graffiti text-base py-3 px-3 shadow-[4px_4px_0_#1A1A1A] hover:shadow-[6px_6px_0_#1A1A1A] hover:translate-y-[-2px] active:shadow-[2px_2px_0_#1A1A1A] active:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {actionLoading === 'offer' ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <>
                            <Hand className="w-5 h-5" />
                            <span>OFFER</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={handleRelease}
                        disabled={actionLoading === 'release' || waitlist.length === 0}
                        className="bg-[#1A1A1A] text-white border-3 border-[#1A1A1A] font-graffiti text-base py-3 px-3 shadow-[4px_4px_0_#1A1A1A] enabled:hover:shadow-[6px_6px_0_#1A1A1A] enabled:hover:translate-y-[-2px] enabled:active:shadow-[2px_2px_0_#1A1A1A] enabled:active:translate-y-[1px] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        title={
                          waitlist.length > 0
                            ? 'Releasing passes your spot to the next head on the bench'
                            : 'Release only works when someone is on the bench — use Offer instead'
                        }
                      >
                        {actionLoading === 'release' ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <>
                            <LogOut className="w-5 h-5" />
                            <span>RELEASE</span>
                          </>
                        )}
                      </button>
                    </div>
                    {waitlist.length === 0 && (
                      <p className="text-xs text-[#1A1A1A]/60 font-body text-center">
                        Release opens up once someone&apos;s on the bench. To give up your
                        spot now, use <span className="font-semibold">Offer</span>.
                      </p>
                    )}
                  </div>
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

              {/* Manager: edit / delete the game */}
              {canManage && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditOpen(true)}
                    className="flex-1 bg-white text-[#1A1A1A] border-2 border-[#1A1A1A] font-graffiti text-sm py-2 px-4 shadow-[3px_3px_0_#1A1A1A] hover:shadow-[4px_4px_0_#1A1A1A] active:shadow-[1px_1px_0_#1A1A1A] transition-all flex items-center justify-center gap-2"
                  >
                    <Pencil className="w-4 h-4" />
                    EDIT GAME
                  </button>
                  <button
                    onClick={() => setConfirmDeleteOpen(true)}
                    disabled={actionLoading === 'delete'}
                    className="flex-1 bg-[#FF5A00] text-white border-2 border-[#1A1A1A] font-graffiti text-sm py-2 px-4 shadow-[3px_3px_0_#1A1A1A] hover:shadow-[4px_4px_0_#1A1A1A] active:shadow-[1px_1px_0_#1A1A1A] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {actionLoading === 'delete' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        DELETE
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Manager: assign a player to an open spot */}
              {canManage && availableSpots > 0 && (
                <div className="border-2 border-dashed border-[#1A1A1A]/40 p-3 space-y-2">
                  <h3 className="font-graffiti text-sm text-[#1A1A1A]">Assign a player</h3>
                  <div className="flex gap-2">
                    <Select value={assignEmail} onValueChange={setAssignEmail}>
                      <SelectTrigger className="flex-1 bg-white border-2 border-[#1A1A1A] rounded-none font-body text-sm focus:ring-0 focus:ring-offset-0 shadow-[2px_2px_0_#1A1A1A]">
                        <SelectValue placeholder="Select a player…" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#F2EFE9] border-2 border-[#1A1A1A] rounded-none">
                        {members
                          .filter(
                            (m) =>
                              !confirmedAttendees.some((a) => a.userEmail === m.userEmail) &&
                              !offeredSpots.some((a) => a.userEmail === m.userEmail)
                          )
                          .map((m) => (
                            <SelectItem key={m.userEmail} value={m.userEmail} className="font-body">
                              {m.displayName}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <button
                      onClick={handleAssign}
                      disabled={!assignEmail || actionLoading === 'assign'}
                      className="bg-[#7FFF00] text-[#1A1A1A] border-2 border-[#1A1A1A] font-graffiti text-sm py-1.5 px-4 shadow-[3px_3px_0_#1A1A1A] hover:shadow-[4px_4px_0_#1A1A1A] active:shadow-[1px_1px_0_#1A1A1A] transition-all disabled:opacity-50"
                    >
                      {actionLoading === 'assign' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'ASSIGN'
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Manager: reassign or remove players already in the game */}
              {canManage && confirmedAttendees.length > 0 && (
                <div className="border-2 border-dashed border-[#1A1A1A]/40 p-3 space-y-2">
                  <h3 className="font-graffiti text-sm text-[#1A1A1A]">Manage Squad</h3>
                  <div className="space-y-2">
                    {confirmedAttendees.map((attendee) => {
                      const busy =
                        actionLoading === `reassign-${attendee.attendeeId}` ||
                        actionLoading === `unassign-${attendee.attendeeId}`;
                      return (
                        <div
                          key={attendee.attendeeId}
                          className="bg-white border-2 border-[#1A1A1A] p-2 space-y-2"
                        >
                          <span className="font-marker text-sm text-[#1A1A1A] block truncate">
                            {attendee.userName}
                          </span>
                          <div className="flex gap-2">
                            <Select
                              value={reassignTarget[attendee.attendeeId] ?? ''}
                              onValueChange={(v) =>
                                setReassignTarget((prev) => ({ ...prev, [attendee.attendeeId]: v }))
                              }
                            >
                              <SelectTrigger className="flex-1 bg-white border-2 border-[#1A1A1A] rounded-none font-body text-xs h-8 focus:ring-0 focus:ring-offset-0 shadow-[2px_2px_0_#1A1A1A]">
                                <SelectValue placeholder="Swap with…" />
                              </SelectTrigger>
                              <SelectContent className="bg-[#F2EFE9] border-2 border-[#1A1A1A] rounded-none">
                                {members
                                  .filter(
                                    (m) =>
                                      !confirmedAttendees.some((a) => a.userEmail === m.userEmail) &&
                                      !offeredSpots.some((a) => a.userEmail === m.userEmail)
                                  )
                                  .map((m) => (
                                    <SelectItem key={m.userEmail} value={m.userEmail} className="font-body">
                                      {m.displayName}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            <button
                              onClick={() => handleReassign(attendee.attendeeId)}
                              disabled={busy || !reassignTarget[attendee.attendeeId]}
                              className="bg-[#0084FF] text-white border-2 border-[#1A1A1A] font-graffiti text-xs py-1 px-3 shadow-[2px_2px_0_#1A1A1A] hover:shadow-[3px_3px_0_#1A1A1A] active:shadow-[1px_1px_0_#1A1A1A] transition-all disabled:opacity-50"
                            >
                              {actionLoading === `reassign-${attendee.attendeeId}` ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                'SWAP'
                              )}
                            </button>
                            <button
                              onClick={() => handleUnassign(attendee.attendeeId)}
                              disabled={busy}
                              title="Remove from game"
                              className="bg-[#FF5A00] text-white border-2 border-[#1A1A1A] py-1 px-2.5 shadow-[2px_2px_0_#1A1A1A] hover:shadow-[3px_3px_0_#1A1A1A] active:shadow-[1px_1px_0_#1A1A1A] transition-all disabled:opacity-50"
                            >
                              {actionLoading === `unassign-${attendee.attendeeId}` ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
                        <span className="font-marker text-[#FF5A00] flex items-center gap-1">
                          {renderRoleIcon(attendee.userEmail)}
                          {attendee.userName}&apos;s spot
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
                      <span className="font-marker text-sm text-[#1A1A1A] truncate flex items-center gap-1.5">
                        <PlayerAvatar
                          pieceUrl={pieceByEmail.get(attendee.userEmail)}
                          name={attendee.userName}
                          className="h-6 w-6 shrink-0"
                        />
                        {renderRoleIcon(attendee.userEmail)}
                        <span className="truncate">{attendee.userName}</span>
                        {attendee.userEmail === userEmail && (
                          <span className="text-[#1A1A1A]/60">(you)</span>
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

              {/* Waitlist */}
              {waitlist.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-graffiti text-lg text-[#0084FF]">
                    The Bench ({waitlist.length})
                  </h3>
                  <div className="space-y-2">
                    {waitlist.map((entry, index) => (
                      <div
                        key={entry.userEmail}
                        className={`marker-card p-2 flex items-center gap-2 ${
                          entry.userEmail === userEmail ? 'bg-[#0084FF]/15' : 'bg-white'
                        }`}
                        style={{ transform: `rotate(${index % 2 === 0 ? -0.3 : 0.3}deg)` }}
                      >
                        <span className="font-graffiti text-[#0084FF] w-6">#{entry.position}</span>
                        <PlayerAvatar
                          pieceUrl={pieceByEmail.get(entry.userEmail)}
                          name={entry.displayName}
                          className="h-6 w-6 shrink-0"
                        />
                        {renderRoleIcon(entry.userEmail)}
                        <span className="font-marker text-sm text-[#1A1A1A] truncate">
                          {entry.displayName}
                          {entry.userEmail === userEmail && (
                            <span className="text-[#1A1A1A]/60 ml-1">(you)</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="py-8 text-center">
            <p className="font-graffiti text-[#1A1A1A]/50">Failed to load game details</p>
          </div>
        )}
      </DialogContent>
    </Dialog>

    {event && (
      <EditEventModal
        open={editOpen}
        onOpenChange={setEditOpen}
        groupId={groupId}
        event={{
          eventId: event.eventId,
          date: event.date,
          startTime: event.startTime,
          endTime: event.endTime,
          totalSpots: event.totalSpots,
          slotCost: event.slotCost,
          location: event.location ?? '',
          description: event.description ?? '',
        }}
        onSaved={() => {
          setEditOpen(false);
          fetchEvent();
          onEventUpdated();
        }}
      />
    )}

    <ConfirmDialog
      open={confirmDeleteOpen}
      onOpenChange={setConfirmDeleteOpen}
      title="Drop This Game?"
      message="This deletes the game for everyone and reverses its spot transactions and credit effects. This can't be undone."
      confirmLabel="DROP IT"
      onConfirm={handleDelete}
      loading={actionLoading === 'delete'}
    />
    </>
  );
}
