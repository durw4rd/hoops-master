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
  ChevronDown,
  UserPlus,
  UserMinus,
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
  myRiderWaitlistPosition: number | null;
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
  const [handoverEmail, setHandoverEmail] = useState("");
  const [handoverRiderEmail, setHandoverRiderEmail] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<Record<string, string>>({});
  const [manageSquadOpen, setManageSquadOpen] = useState(false);

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

  const handleOffer = async (attendeeId?: string) => {
    setActionLoading(attendeeId ? 'offer-rider' : 'offer');
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/events/${eventId}/offer`, {
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
      setError('Failed to offer spot');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetract = async (attendeeId?: string) => {
    setActionLoading(attendeeId ? 'retract-rider' : 'retract');
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/events/${eventId}/retract`, {
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
      setError('Failed to retract offer');
    } finally {
      setActionLoading(null);
    }
  };

  const handleClaimRider = async () => {
    setActionLoading('claim-rider');
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/events/${eventId}/claim-rider`, {
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
    } catch {
      setError('Failed to bring Rider');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReleaseRider = async () => {
    setActionLoading('release-rider');
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/events/${eventId}/drop-rider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      fetchEvent();
      onEventUpdated();
    } catch {
      setError('Failed to release Rider spot');
    } finally {
      setActionLoading(null);
    }
  };

  const handleHandoverRider = async () => {
    if (!handoverRiderEmail) return;
    setActionLoading('handover-rider');
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/events/${eventId}/hand-rider-over`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUserEmail: handoverRiderEmail }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setHandoverRiderEmail('');
      fetchEvent();
      onEventUpdated();
    } catch {
      setError('Failed to hand over Rider spot');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSelfHandover = async () => {
    if (!handoverEmail) return;
    setActionLoading('handover');
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/events/${eventId}/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUserEmail: handoverEmail }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setHandoverEmail('');
      fetchEvent();
      onEventUpdated();
    } catch { setError('Failed to hand over spot'); }
    finally { setActionLoading(null); }
  };

  const handleAdminAssignRider = async (targetUserEmail: string) => {
    setActionLoading(`assign-rider-${targetUserEmail}`);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/events/${eventId}/claim-rider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      fetchEvent();
      onEventUpdated();
    } catch {
      setError('Failed to assign Rider spot');
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

  const handleJoinRiderWaitlist = async () => {
    setActionLoading('rider-waitlist-join');
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/events/${eventId}/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forRider: true }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      fetchEvent();
      onEventUpdated();
    } catch { setError('Failed to join rider bench'); }
    finally { setActionLoading(null); }
  };

  const handleLeaveRiderWaitlist = async () => {
    setActionLoading('rider-waitlist-leave');
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/events/${eventId}/waitlist`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forRider: true }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      fetchEvent();
      onEventUpdated();
    } catch { setError('Failed to leave rider bench'); }
    finally { setActionLoading(null); }
  };

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
      return <Crown className="w-3.5 h-3.5 text-dull-gold flex-shrink-0" aria-label="Crew Capo" />;
    }
    if (isCrewManager(role)) {
      return <Star className="w-3.5 h-3.5 text-terracotta flex-shrink-0" aria-label="King" />;
    }
    return null;
  };

  const confirmedAttendees = event?.attendees.filter(a => a.status === 'confirmed' && !a.isPlusOne) || [];
  const offeredSpots = event?.attendees.filter(a => a.status === 'offered' && !a.isPlusOne) || [];
  // Rider spots (plus-ones) — keyed by owner email for display grouping.
  const riderSpots = event?.attendees.filter(a => a.isPlusOne) || [];
  const myRiderSpot = riderSpots.find(a => a.userEmail.toLowerCase() === userEmail.toLowerCase()) || null;
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
      <DialogContent className="graffiti-dialog max-w-lg max-h-[85vh] overflow-y-auto mx-2 sm:mx-auto rounded-none shadow-sticker-lg">
        <DialogHeader>
          <DialogTitle className="graffiti-dialog-title">
            {loading ? 'Loading...' : event ? formatDate(event.date) : 'Game Details'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Game details and attendance management
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4 py-4">
            <div className="animate-pulse space-y-3">
              <div className="h-8 w-48 bg-asphalt/10 rounded" />
              <div className="h-6 w-32 bg-asphalt/10 rounded" />
              <div className="grid grid-cols-2 gap-2 mt-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-12 bg-asphalt/10 rounded" />
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
                  <span className="bg-dull-gold text-asphalt border-2 border-asphalt font-graffiti px-2 py-0.5 text-xs flex items-center gap-1">
                    <Euro className="w-3 h-3" />
                    {event.slotCost.toFixed(2)}
                  </span>
                )}
              </div>

              {/* Signup Status */}
              {!isSignupOpen && signupOpensAt && formatSignupTime(signupOpensAt) && (
                <div className="bg-dull-gold border-2 border-asphalt p-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Lock className="w-4 h-4 text-asphalt" />
                    <p className="font-graffiti text-asphalt">
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
                    className="w-full relative bg-moss-green text-asphalt border-4 border-asphalt font-graffiti text-xl py-4 px-6 shadow-[6px_6px_0_var(--asphalt-black)] hover:shadow-sticker-lg hover:translate-y-[-2px] active:shadow-sticker-sm active:translate-y-[2px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
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
                
                {/* Join waitlist / claim oldest offered spot when the event is full */}
                {!event.isAttending && isFull && isSignupOpen && event.myWaitlistPosition === null && (
                  <button
                    onClick={() => {
                      const sorted = [...offeredSpots].sort(
                        (a, b) =>
                          new Date(a.offeredAt ?? 0).getTime() - new Date(b.offeredAt ?? 0).getTime()
                      );
                      const earliest = sorted[0];
                      if (earliest) {
                        handleClaim(earliest.attendeeId);
                      } else {
                        handleJoinWaitlist();
                      }
                    }}
                    disabled={actionLoading === 'waitlist' || actionLoading === 'claim'}
                    className="w-full bg-slate-blue text-white border-[3px] border-asphalt font-graffiti text-lg py-3 px-5 shadow-sticker-md hover:shadow-[6px_6px_0_var(--asphalt-black)] hover:translate-y-[-2px] active:shadow-sticker-sm active:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {actionLoading === 'waitlist' || actionLoading === 'claim' ? (
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
                    <div className="bg-slate-blue/10 border-2 border-slate-blue p-3 text-center font-graffiti text-slate-blue">
                      You&apos;re #{event.myWaitlistPosition} on the bench
                    </div>
                    <button
                      onClick={handleLeaveWaitlist}
                      disabled={actionLoading === 'waitlist'}
                      className="w-full bg-white text-asphalt border-[3px] border-asphalt font-graffiti text-base py-2.5 px-5 shadow-[3px_3px_0_var(--asphalt-black)] hover:shadow-[5px_5px_0_#1A1A1A] active:shadow-[1px_1px_0_var(--asphalt-black)] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
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

                {event.myAttendance?.status === 'confirmed' && (() => {
                  const riderConfirmed = myRiderSpot?.status === 'confirmed';
                  const riderOffered = myRiderSpot?.status === 'offered';
                  // Bench has any entry (primary or rider) → use RELEASE, not OFFER.
                  const hasBench = waitlist.length > 0;
                  // Rider bench specifically for contextual rider controls.
                  const hasRiderBench = waitlist.some((w) => w.forRider);
                  // Members eligible to receive a rider handover: have a primary spot but no rider.
                  const riderHandoverEligible = members.filter(
                    (m) =>
                      m.userEmail.toLowerCase() !== userEmail.toLowerCase() &&
                      confirmedAttendees.some((a) => a.userEmail === m.userEmail && !a.isPlusOne) &&
                      !riderSpots.some((a) => a.userEmail === m.userEmail)
                  );

                  return (
                    <div className="space-y-1.5">
                      {/* ── Rider spot controls ── */}
                      {riderConfirmed && (
                        hasRiderBench ? (
                          // Rider bench has entries → RELEASE RIDER auto-promotes.
                          <button
                            onClick={handleReleaseRider}
                            disabled={actionLoading === 'release-rider'}
                            title="Passes your Rider slot to the next head on the Rider bench"
                            className="w-full bg-asphalt text-white border-[3px] border-asphalt font-graffiti text-sm py-2.5 px-3 shadow-sticker-md hover:shadow-[6px_6px_0_var(--asphalt-black)] hover:translate-y-[-2px] active:shadow-sticker-sm active:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                          >
                            {actionLoading === 'release-rider' ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UserMinus className="w-4 h-4" /><span>RELEASE RIDER</span></>}
                          </button>
                        ) : (
                          // Rider bench empty → OFFER RIDER + HAND RIDER OVER.
                          <>
                            <button
                              onClick={() => handleOffer(myRiderSpot.attendeeId)}
                              disabled={actionLoading === 'offer'}
                              title="Opens your Rider slot for someone to claim"
                              className="w-full bg-terracotta text-white border-[3px] border-asphalt font-graffiti text-sm py-2.5 px-3 shadow-sticker-md hover:shadow-[6px_6px_0_var(--asphalt-black)] hover:translate-y-[-2px] active:shadow-sticker-sm active:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                            >
                              {actionLoading === 'offer' ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Hand className="w-4 h-4" /><span>OFFER RIDER</span></>}
                            </button>
                            <div className="flex gap-2 pt-0.5">
                              <Select value={handoverRiderEmail} onValueChange={setHandoverRiderEmail}>
                                <SelectTrigger className="flex-1 bg-white border-2 border-asphalt rounded-none font-body text-xs h-9 focus:ring-0 focus:ring-offset-0 shadow-sticker-sm">
                                  <SelectValue placeholder="Hand Rider to…" />
                                </SelectTrigger>
                                <SelectContent className="bg-sticker-white border-2 border-asphalt rounded-none">
                                  {riderHandoverEligible.length === 0 ? (
                                    <div className="px-3 py-2 text-xs text-asphalt/50 font-body">No eligible players</div>
                                  ) : (
                                    riderHandoverEligible.map((m) => (
                                      <SelectItem key={m.userEmail} value={m.userEmail} className="font-body">
                                        {m.displayName}
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                              <button
                                onClick={handleHandoverRider}
                                disabled={!handoverRiderEmail || actionLoading === 'handover-rider'}
                                className="bg-dull-gold text-asphalt border-2 border-asphalt font-graffiti text-xs py-1 px-3 shadow-sticker-sm hover:shadow-[3px_3px_0_var(--asphalt-black)] active:shadow-[1px_1px_0_var(--asphalt-black)] transition-all disabled:opacity-50 whitespace-nowrap"
                              >
                                {actionLoading === 'handover-rider' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'HAND RIDER OVER'}
                              </button>
                            </div>
                          </>
                        )
                      )}
                      {riderOffered && (
                        <button
                          onClick={() => handleRetract(myRiderSpot.attendeeId)}
                          disabled={actionLoading === 'retract-rider'}
                          className="w-full bg-white text-asphalt border-[3px] border-asphalt font-graffiti text-base py-2.5 px-5 shadow-sticker-md hover:shadow-[6px_6px_0_var(--asphalt-black)] hover:translate-y-[-2px] active:shadow-sticker-sm active:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {actionLoading === 'retract-rider' ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Undo2 className="w-5 h-5" /><span>RETRACT RIDER OFFER</span></>}
                        </button>
                      )}

                      {/* ── Primary spot: single contextual give-up button ── */}
                      {riderConfirmed ? (
                        // Blocked while rider is confirmed — must hand rider off first.
                        <p className="text-xs text-asphalt/60 font-body text-center">
                          Sort your Rider spot before leaving your own.
                        </p>
                      ) : hasBench ? (
                        // Bench has entries → RELEASE auto-promotes first in queue.
                        <button
                          onClick={handleRelease}
                          disabled={actionLoading === 'release'}
                          title="Passes your spot to the next head on the bench"
                          className="w-full bg-asphalt text-white border-[3px] border-asphalt font-graffiti text-base py-3 px-5 shadow-sticker-md hover:shadow-[6px_6px_0_var(--asphalt-black)] hover:translate-y-[-2px] active:shadow-sticker-sm active:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {actionLoading === 'release' ? <Loader2 className="w-5 h-5 animate-spin" /> : <><LogOut className="w-5 h-5" /><span>RELEASE</span></>}
                        </button>
                      ) : (
                        // Bench empty → OFFER puts spot on the marketplace.
                        <button
                          onClick={() => handleOffer()}
                          disabled={actionLoading === 'offer'}
                          title="Opens your spot for anyone in the crew to claim"
                          className="w-full bg-terracotta text-white border-[3px] border-asphalt font-graffiti text-base py-3 px-5 shadow-sticker-md hover:shadow-[6px_6px_0_var(--asphalt-black)] hover:translate-y-[-2px] active:shadow-sticker-sm active:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {actionLoading === 'offer' ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Hand className="w-5 h-5" /><span>OFFER</span></>}
                        </button>
                      )}

                      {/* ── Direct handover: pass primary spot to a specific player ── */}
                      {!riderConfirmed && (
                        <div className="flex gap-2 pt-0.5">
                          <Select value={handoverEmail} onValueChange={setHandoverEmail}>
                            <SelectTrigger className="flex-1 bg-white border-2 border-asphalt rounded-none font-body text-xs h-9 focus:ring-0 focus:ring-offset-0 shadow-sticker-sm">
                              <SelectValue placeholder="Hand it to…" />
                            </SelectTrigger>
                            <SelectContent className="bg-sticker-white border-2 border-asphalt rounded-none">
                              {members
                                .filter(
                                  (m) =>
                                    m.userEmail.toLowerCase() !== userEmail.toLowerCase() &&
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
                            onClick={handleSelfHandover}
                            disabled={!handoverEmail || actionLoading === 'handover'}
                            className="bg-slate-blue text-white border-2 border-asphalt font-graffiti text-xs py-1 px-3 shadow-sticker-sm hover:shadow-[3px_3px_0_var(--asphalt-black)] active:shadow-[1px_1px_0_var(--asphalt-black)] transition-all disabled:opacity-50 whitespace-nowrap"
                          >
                            {actionLoading === 'handover' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'HAND IT OVER'}
                          </button>
                        </div>
                      )}

                      {/* ── Rider section ── */}
                      {!myRiderSpot && !event.myRiderWaitlistPosition && isSignupOpen && (
                        availableSpots > 0 ? (
                          <button
                            onClick={handleClaimRider}
                            disabled={actionLoading === 'claim-rider'}
                            className="w-full bg-dull-gold text-asphalt border-[3px] border-asphalt font-graffiti text-base py-3 px-5 shadow-sticker-md hover:shadow-[6px_6px_0_var(--asphalt-black)] hover:translate-y-[-2px] active:shadow-sticker-sm active:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {actionLoading === 'claim-rider' ? <Loader2 className="w-5 h-5 animate-spin" /> : <><UserPlus className="w-5 h-5" /><span>BRING A RIDER</span></>}
                          </button>
                        ) : (
                          <button
                            onClick={handleJoinRiderWaitlist}
                            disabled={actionLoading === 'rider-waitlist-join'}
                            className="w-full bg-dull-gold/60 text-asphalt border-[3px] border-asphalt font-graffiti text-base py-3 px-5 shadow-sticker-md hover:shadow-[6px_6px_0_var(--asphalt-black)] hover:translate-y-[-2px] active:shadow-sticker-sm active:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {actionLoading === 'rider-waitlist-join' ? <Loader2 className="w-5 h-5 animate-spin" /> : <><UserPlus className="w-5 h-5" /><span>PUT RIDER ON THE BENCH</span></>}
                          </button>
                        )
                      )}

                      {/* Take rider off the bench */}
                      {!myRiderSpot && event.myRiderWaitlistPosition && (
                        <div className="space-y-1">
                          <p className="text-xs text-asphalt/60 font-body text-center">
                            Your Rider is <span className="font-semibold">#{event.myRiderWaitlistPosition}</span> on the bench
                          </p>
                          <button
                            onClick={handleLeaveRiderWaitlist}
                            disabled={actionLoading === 'rider-waitlist-leave'}
                            className="w-full bg-white text-asphalt border-[3px] border-asphalt font-graffiti text-sm py-2.5 px-5 shadow-sticker-md hover:shadow-[6px_6px_0_var(--asphalt-black)] hover:translate-y-[-2px] active:shadow-sticker-sm active:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {actionLoading === 'rider-waitlist-leave' ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UserMinus className="w-4 h-4" /><span>TAKE RIDER OFF THE BENCH</span></>}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {event.myAttendance?.status === 'offered' && (
                  <button
                    onClick={() => handleRetract()}
                    disabled={actionLoading === 'retract'}
                    className="w-full bg-white text-asphalt border-[3px] border-asphalt font-graffiti text-lg py-3 px-5 shadow-sticker-md hover:shadow-[6px_6px_0_var(--asphalt-black)] hover:translate-y-[-2px] active:shadow-sticker-sm active:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                <div className="p-2 bg-terracotta/10 border-2 border-terracotta">
                  <p className="text-sm text-terracotta font-body">{error}</p>
                </div>
              )}

              {/* Manager: edit / delete the game */}
              {canManage && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditOpen(true)}
                    className="flex-1 bg-white text-asphalt border-2 border-asphalt font-graffiti text-sm py-2 px-4 shadow-[3px_3px_0_var(--asphalt-black)] hover:shadow-sticker-md active:shadow-[1px_1px_0_var(--asphalt-black)] transition-all flex items-center justify-center gap-2"
                  >
                    <Pencil className="w-4 h-4" />
                    EDIT GAME
                  </button>
                  <button
                    onClick={() => setConfirmDeleteOpen(true)}
                    disabled={actionLoading === 'delete'}
                    className="flex-1 bg-terracotta text-white border-2 border-asphalt font-graffiti text-sm py-2 px-4 shadow-[3px_3px_0_var(--asphalt-black)] hover:shadow-sticker-md active:shadow-[1px_1px_0_var(--asphalt-black)] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
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
                <div className="border-2 border-dashed border-asphalt/40 p-3 space-y-2">
                  <h3 className="font-graffiti text-sm text-asphalt">Assign a player</h3>
                  <div className="flex gap-2">
                    <Select value={assignEmail} onValueChange={setAssignEmail}>
                      <SelectTrigger className="flex-1 bg-white border-2 border-asphalt rounded-none font-body text-sm focus:ring-0 focus:ring-offset-0 shadow-sticker-sm">
                        <SelectValue placeholder="Select a player…" />
                      </SelectTrigger>
                      <SelectContent className="bg-sticker-white border-2 border-asphalt rounded-none">
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
                      className="bg-moss-green text-asphalt border-2 border-asphalt font-graffiti text-sm py-1.5 px-4 shadow-[3px_3px_0_var(--asphalt-black)] hover:shadow-sticker-md active:shadow-[1px_1px_0_var(--asphalt-black)] transition-all disabled:opacity-50"
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

              {/* Manager: reassign or remove players already in the game (confirmed + offered + riders) */}
              {canManage && (confirmedAttendees.length + offeredSpots.length + riderSpots.length) > 0 && (
                <div className="border-2 border-dashed border-asphalt/40">
                  <button
                    type="button"
                    onClick={() => setManageSquadOpen((v) => !v)}
                    className="w-full flex items-center justify-between gap-2 p-3 text-left"
                  >
                    <span className="font-graffiti text-sm text-asphalt">
                      Manage Squad ({confirmedAttendees.length + offeredSpots.length + riderSpots.length})
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-asphalt flex-shrink-0 transition-transform ${manageSquadOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {manageSquadOpen && (
                    <div className="border-t-2 border-dashed border-asphalt/40 p-3 space-y-2">
                      {[...confirmedAttendees, ...offeredSpots, ...riderSpots].map((attendee) => {
                        const busy =
                          actionLoading === `reassign-${attendee.attendeeId}` ||
                          actionLoading === `unassign-${attendee.attendeeId}`;
                        const hasRider = riderSpots.some(
                          (r) => r.userEmail.toLowerCase() === attendee.userEmail.toLowerCase()
                        );
                        return (
                          <div
                            key={attendee.attendeeId}
                            className="bg-white border-2 border-asphalt p-2 space-y-2"
                          >
                            <span className="font-marker text-sm text-asphalt flex items-center gap-1.5 truncate">
                              {attendee.isPlusOne ? `${attendee.userName}'s Rider` : attendee.userName}
                              {attendee.status === 'offered' && (
                                <span className="text-[10px] font-graffiti bg-terracotta text-white px-1 py-0.5 leading-none shrink-0">
                                  OFFERING
                                </span>
                              )}
                              {attendee.isPlusOne && (
                                <span className="text-[10px] font-graffiti bg-dull-gold text-asphalt px-1 py-0.5 leading-none shrink-0">
                                  RIDER
                                </span>
                              )}
                            </span>
                            <div className="flex gap-2">
                              <Select
                                value={reassignTarget[attendee.attendeeId] ?? ''}
                                onValueChange={(v) =>
                                  setReassignTarget((prev) => ({ ...prev, [attendee.attendeeId]: v }))
                                }
                              >
                                <SelectTrigger className="flex-1 bg-white border-2 border-asphalt rounded-none font-body text-xs h-8 focus:ring-0 focus:ring-offset-0 shadow-sticker-sm">
                                  <SelectValue placeholder="Swap with…" />
                                </SelectTrigger>
                                <SelectContent className="bg-sticker-white border-2 border-asphalt rounded-none">
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
                                className="bg-slate-blue text-white border-2 border-asphalt font-graffiti text-xs py-1 px-3 shadow-sticker-sm hover:shadow-[3px_3px_0_var(--asphalt-black)] active:shadow-[1px_1px_0_var(--asphalt-black)] transition-all disabled:opacity-50"
                              >
                                {actionLoading === `reassign-${attendee.attendeeId}` ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  'SWAP'
                                )}
                              </button>
                              {/* Add Rider button — only for primary spots with no rider yet and capacity */}
                              {!attendee.isPlusOne && !hasRider && availableSpots > 0 && (
                                <button
                                  onClick={() => handleAdminAssignRider(attendee.userEmail)}
                                  disabled={!!actionLoading}
                                  title="Add a Rider (+1) spot for this player"
                                  className="bg-dull-gold text-asphalt border-2 border-asphalt font-graffiti text-xs py-1 px-2.5 shadow-sticker-sm hover:shadow-[3px_3px_0_var(--asphalt-black)] active:shadow-[1px_1px_0_var(--asphalt-black)] transition-all disabled:opacity-50 flex items-center gap-1"
                                >
                                  {actionLoading === `assign-rider-${attendee.userEmail}` ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <><UserPlus className="w-3.5 h-3.5" /><span>+1</span></>
                                  )}
                                </button>
                              )}
                              <button
                                onClick={() => handleUnassign(attendee.attendeeId)}
                                disabled={busy}
                                title="Remove from game"
                                className="bg-terracotta text-white border-2 border-asphalt py-1 px-2.5 shadow-sticker-sm hover:shadow-[3px_3px_0_var(--asphalt-black)] active:shadow-[1px_1px_0_var(--asphalt-black)] transition-all disabled:opacity-50"
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
                  )}
                </div>
              )}

              {/* Offered Spots */}
              {offeredSpots.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-graffiti text-lg text-terracotta">
                    Available Spots ({offeredSpots.length})
                  </h3>
                  <div className="space-y-2">
                    {offeredSpots.map((attendee, index) => (
                      <div 
                        key={attendee.attendeeId} 
                        className="marker-card bg-terracotta/10 p-3 flex items-center justify-between"
                        style={{ transform: `rotate(${index % 2 === 0 ? -0.3 : 0.3}deg)` }}
                      >
                        <span className="font-marker text-terracotta flex items-center gap-1">
                          {renderRoleIcon(attendee.userEmail)}
                          {attendee.userName}&apos;s spot
                        </span>
                        {!event.isAttending && isSignupOpen && (
                          <button
                            onClick={() => handleClaim(attendee.attendeeId)}
                            disabled={actionLoading === 'claim'}
                            className="bg-moss-green text-asphalt border-2 border-asphalt font-graffiti text-sm py-1.5 px-4 shadow-[3px_3px_0_var(--asphalt-black)] hover:shadow-sticker-md active:shadow-[1px_1px_0_var(--asphalt-black)] transition-all disabled:opacity-50"
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

              {/* Playing: confirmed + offered (primary) + rider spots — all count toward occupancy */}
              {(() => {
                // Build an ordered flat list: primary → their rider (if any) → next primary → ...
                const riderByOwner = new Map(riderSpots.map(r => [r.userEmail.toLowerCase(), r]));
                const primaryList = [...confirmedAttendees, ...offeredSpots];
                const displayList: Array<{ attendee: typeof primaryList[0]; isRider: boolean }> = [];
                const ownersWithRider = new Set<string>();
                for (const a of primaryList) {
                  displayList.push({ attendee: a, isRider: false });
                  const rider = riderByOwner.get(a.userEmail.toLowerCase());
                  if (rider) {
                    displayList.push({ attendee: rider, isRider: true });
                    ownersWithRider.add(a.userEmail.toLowerCase());
                  }
                }
                // Orphan riders (edge case: primary transferred away but rider still exists)
                for (const r of riderSpots) {
                  if (!ownersWithRider.has(r.userEmail.toLowerCase())) {
                    displayList.push({ attendee: r, isRider: true });
                  }
                }
                const totalPlaying = confirmedAttendees.length + offeredSpots.length + riderSpots.length;
                return (
                  <div className="space-y-2">
                    <h3 className="font-graffiti text-lg text-slate-blue">
                      Playing ({totalPlaying}/{event.totalSpots})
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {displayList.map(({ attendee, isRider }, index) => (
                        <div
                          key={attendee.attendeeId}
                          className={`marker-card p-2 ${
                            isRider
                              ? 'bg-dull-gold/30 border-dashed'
                              : attendee.userEmail === userEmail
                              ? 'bg-moss-green border-asphalt'
                              : 'bg-white'
                          }`}
                          style={{ transform: `rotate(${index % 2 === 0 ? -0.5 : 0.5}deg)` }}
                        >
                          <span className="font-marker text-sm text-asphalt truncate flex flex-wrap items-center gap-1.5">
                            {!isRider && (
                              <PlayerAvatar
                                pieceUrl={pieceByEmail.get(attendee.userEmail)}
                                name={attendee.userName}
                                className="h-6 w-6 shrink-0"
                              />
                            )}
                            {!isRider && renderRoleIcon(attendee.userEmail)}
                            <span className="truncate">
                              {isRider ? `${attendee.userName}'s Rider` : attendee.userName}
                            </span>
                            {!isRider && attendee.userEmail === userEmail && (
                              <span className="text-asphalt/60">(you)</span>
                            )}
                            {isRider && attendee.userEmail === userEmail && (
                              <span className="text-asphalt/60">(yours)</span>
                            )}
                            {attendee.status === 'offered' && (
                              <span className="text-[10px] font-graffiti bg-terracotta text-white px-1 py-0.5 leading-none shrink-0">
                                OFFERING
                              </span>
                            )}
                          </span>
                        </div>
                      ))}

                      {/* Empty spots */}
                      {Array.from({ length: availableSpots }).map((_, i) => (
                        <div
                          key={`empty-${i}`}
                          className="marker-card p-2 border-dashed border-asphalt/30 bg-white/50"
                          style={{ transform: `rotate(${i % 2 === 0 ? -0.3 : 0.3}deg)` }}
                        >
                          <span className="text-sm text-asphalt/30 font-body">Open</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Waitlist */}
              {waitlist.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-graffiti text-lg text-slate-blue">
                    The Bench ({waitlist.length})
                  </h3>
                  <div className="space-y-2">
                    {waitlist.map((entry, index) => (
                      <div
                        key={entry.userEmail}
                        className={`marker-card p-2 flex items-center gap-2 ${
                          entry.userEmail === userEmail ? 'bg-slate-blue/15' : 'bg-white'
                        }`}
                        style={{ transform: `rotate(${index % 2 === 0 ? -0.3 : 0.3}deg)` }}
                      >
                        <span className="font-graffiti text-slate-blue w-6">#{entry.position}</span>
                        <PlayerAvatar
                          pieceUrl={pieceByEmail.get(entry.userEmail)}
                          name={entry.displayName}
                          className="h-6 w-6 shrink-0"
                        />
                        {renderRoleIcon(entry.userEmail)}
                        <span className="font-marker text-sm text-asphalt truncate flex items-center gap-1.5">
                          {entry.forRider ? `${entry.displayName}'s Rider` : entry.displayName}
                          {entry.userEmail === userEmail && (
                            <span className="text-asphalt/60">(you)</span>
                          )}
                          {entry.forRider && (
                            <span className="text-[10px] font-graffiti bg-dull-gold text-asphalt px-1 py-0.5 leading-none shrink-0">
                              RIDER
                            </span>
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
            <p className="font-graffiti text-asphalt/50">Failed to load game details</p>
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
