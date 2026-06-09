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
import Image from "next/image";
import EditEventModal from "./EditEventModal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import type { BannerOrientation, EventType } from "@/lib/types";
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
  eventType?: EventType;
  bannerUrl?: string | null;
  bannerOrientation?: BannerOrientation;
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

  // Re-fetch event data when the user returns to the tab (catches stale state
  // from race conditions where other players acted while this modal was open).
  useEffect(() => {
    if (!open) return;
    const onFocus = () => fetchEvent();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [open, fetchEvent]);

  const handleDelete = async () => {
    setActionLoading('delete');
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/events/${eventId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
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
      if (!res.ok) { setError(data.error); return; }
      fetchEvent();
      onEventUpdated();
    } catch {
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
      if (!res.ok) { setError(data.error); return; }
      fetchEvent();
      onEventUpdated();
    } catch {
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
      if (!res.ok) { setError(data.error); return; }
      fetchEvent();
      onEventUpdated();
    } catch {
      setError('Failed to retract offer');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddRider = async () => {
    setActionLoading('add-rider');
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/events/${eventId}/claim-rider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      fetchEvent();
      onEventUpdated();
    } catch {
      setError('Failed to bring Rider');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDropRider = async () => {
    setActionLoading('drop-rider');
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
      setError('Failed to drop Rider');
    } finally {
      setActionLoading(null);
    }
  };

  const handleOfferRider = async (riderAttendeeId: string) => {
    setActionLoading('offer-rider');
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/events/${eventId}/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeId: riderAttendeeId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      fetchEvent();
      onEventUpdated();
    } catch {
      setError('Failed to offer Rider');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetractRiderOffer = async (riderAttendeeId: string) => {
    setActionLoading('retract-rider');
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/events/${eventId}/retract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeId: riderAttendeeId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      fetchEvent();
      onEventUpdated();
    } catch {
      setError('Failed to retract Rider offer');
    } finally {
      setActionLoading(null);
    }
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
      if (!res.ok) { setError(data.error); return; }
      fetchEvent();
      onEventUpdated();
    } catch {
      setError('Failed to assign Rider');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSelfHandover = async () => {
    if (!handoverEmail) return;
    setActionLoading('handover');
    setError(null);
    try {
      // Explicitly target the primary attendeeId so rider-first selection doesn't interfere.
      const res = await fetch(`/api/groups/${groupId}/events/${eventId}/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toUserEmail: handoverEmail,
          attendeeId: myAttendance?.attendeeId,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setHandoverEmail('');
      fetchEvent();
      onEventUpdated();
    } catch {
      setError('Failed to hand over spot');
    } finally {
      setActionLoading(null);
    }
  };

  const runAction = async (key: string, path: string, method: string = 'POST', body?: object) => {
    setActionLoading(key);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/events/${eventId}/${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      fetchEvent();
      onEventUpdated();
    } catch {
      setError(`Failed to ${key}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRelease = () => runAction('release', 'release');
  const handleJoinWaitlist = () => runAction('waitlist', 'waitlist', 'POST');
  const handleLeaveWaitlist = () => runAction('waitlist', 'waitlist', 'DELETE');
  const handleJoinRiderWaitlist = () =>
    runAction('rider-waitlist-join', 'waitlist', 'POST', { forRider: true });
  const handleLeaveRiderWaitlist = () =>
    runAction('rider-waitlist-leave', 'waitlist', 'DELETE', { forRider: true });

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
      if (!res.ok) { setError(data.error); return; }
      setAssignEmail("");
      fetchEvent();
      onEventUpdated();
    } catch {
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
      if (!res.ok) { setError(data.error); return; }
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
      if (!res.ok) { setError(data.error); return; }
      fetchEvent();
      onEventUpdated();
    } catch {
      setError('Failed to remove player');
    } finally {
      setActionLoading(null);
    }
  };

  // Helpers
  const roleByEmail = new Map(members.map((m) => [m.userEmail, m.groupRole]));
  const pieceByEmail = new Map(members.map((m) => [m.userEmail, m.pieceUrl]));
  const renderRoleIcon = (email: string) => {
    const role = roleByEmail.get(email);
    if (isCapoRole(role ?? '')) return <Crown className="w-3.5 h-3.5 text-dull-gold flex-shrink-0" aria-label="Crew Capo" />;
    if (isCrewManager(role ?? '')) return <Star className="w-3.5 h-3.5 text-terracotta flex-shrink-0" aria-label="King" />;
    return null;
  };

  // Derived state — two-row model (separate row per rider)
  const allAttendees = event?.attendees ?? [];
  // Primary rows only (parentAttendeeId is null → isPlusOne is false)
  const primaryAttendees = allAttendees.filter(a => !a.isPlusOne);
  const confirmedAttendees = allAttendees.filter(a => a.status === 'confirmed');
  const offeredSpots = allAttendees.filter(a => a.status === 'offered');
  const availableSpots = event?.availableSpots ?? 0;
  const isFull = availableSpots <= 0;
  const waitlist = event?.waitlist ?? [];
  const hasBench = waitlist.some(w => !w.forRider);
  const hasRiderBench = waitlist.some(w => w.forRider);

  // My primary attendance row (server already filters to primary: !isPlusOne)
  const myAttendance = event?.myAttendance ?? null;
  const isConfirmed = myAttendance?.status === 'confirmed';
  const isOffered = myAttendance?.status === 'offered';

  // My rider row (a separate attendee row with isPlusOne=true and matching email)
  const myRiderAttendance = allAttendees.find(
    a => a.isPlusOne && a.userEmail.toLowerCase() === userEmail.toLowerCase()
  ) ?? null;
  const hasRider = myRiderAttendance !== null;
  const riderIsConfirmed = myRiderAttendance?.status === 'confirmed';
  const riderIsOffered = myRiderAttendance?.status === 'offered';

  const onRiderBench = (event?.myRiderWaitlistPosition ?? null) !== null;

  // Signup window check
  const getSignupStatus = () => {
    if (!event?.signupOpensAt || event.signupOpensAt.trim() === '') return { isOpen: true, opensAt: null };
    const d = new Date(event.signupOpensAt);
    if (isNaN(d.getTime()) || d.getFullYear() < 2000) return { isOpen: true, opensAt: null };
    return { isOpen: d <= new Date(), opensAt: d };
  };
  const { isOpen: isSignupOpen, opensAt: signupOpensAt } = getSignupStatus();
  const formatSignupTime = (d: Date | null) =>
    d ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Members who hold no primary spot (targets for admin assign / self handover)
  const membersWithoutSpot = members.filter(
    (m) => !primaryAttendees.some((a) => a.userEmail === m.userEmail)
  );

  // Each attendee row = 1 slot (both primary and rider rows count)
  const totalOccupancy = allAttendees.length;

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
            <div className="space-y-4 mt-2">
              {event.eventType === "special" && event.bannerUrl && (
                <div
                  className={`relative -mx-2 overflow-hidden border-2 border-asphalt grain-overlay ${
                    event.bannerOrientation === "portrait" ? "h-48 w-36 mx-auto" : "h-32 w-full"
                  }`}
                >
                  <Image src={event.bannerUrl} alt="" fill className="object-cover" />
                </div>
              )}

              {event.eventType === "special" && (
                <span className="tag-label-orange text-[10px] inline-block">SPECIAL</span>
              )}

              {event.description && (
                <p className="text-sm text-asphalt/70 font-body">{event.description}</p>
              )}

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
                  {totalOccupancy}/{event.totalSpots}
                </span>
                {event.slotCost > 0 && (
                  <span className="bg-dull-gold text-asphalt border-2 border-asphalt font-graffiti px-2 py-0.5 text-xs flex items-center gap-1">
                    <Euro className="w-3 h-3" />
                    {event.slotCost.toFixed(2)}
                  </span>
                )}
              </div>

              {/* Signup locked banner */}
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

              {/* ── Primary Action Area ── */}
              <div className="space-y-2">

                {/* Not attending → CLAIM SPOT */}
                {!event.isAttending && availableSpots > 0 && isSignupOpen && (
                  <button
                    onClick={() => handleClaim()}
                    disabled={actionLoading === 'claim'}
                    className="w-full bg-moss-green text-asphalt border-4 border-asphalt font-graffiti text-xl py-4 px-6 shadow-[6px_6px_0_var(--asphalt-black)] hover:shadow-sticker-lg hover:translate-y-[-2px] active:shadow-sticker-sm active:translate-y-[2px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                  >
                    {actionLoading === 'claim' ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <><span className="text-2xl">🏀</span><span>CLAIM SPOT</span><Check className="w-6 h-6" /></>
                    )}
                  </button>
                )}

                {/* Not attending, event full → GET ON THE BENCH (auto-claims offered spot if any) */}
                {!event.isAttending && isFull && isSignupOpen && event.myWaitlistPosition === null && (
                  <button
                    onClick={() => {
                      const earliest = [...offeredSpots].sort(
                        (a, b) => new Date(a.offeredAt ?? 0).getTime() - new Date(b.offeredAt ?? 0).getTime()
                      )[0];
                      if (earliest) handleClaim(earliest.attendeeId);
                      else handleJoinWaitlist();
                    }}
                    disabled={actionLoading === 'waitlist' || actionLoading === 'claim'}
                    className="w-full bg-slate-blue text-white border-[3px] border-asphalt font-graffiti text-lg py-3 px-5 shadow-sticker-md hover:shadow-[6px_6px_0_var(--asphalt-black)] hover:translate-y-[-2px] active:shadow-sticker-sm active:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {actionLoading === 'waitlist' || actionLoading === 'claim' ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <><ListPlus className="w-5 h-5" /><span>GET ON THE BENCH</span></>
                    )}
                  </button>
                )}

                {/* On the bench */}
                {event.myWaitlistPosition !== null && (
                  <div className="space-y-1.5">
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
                        <><LogOut className="w-5 h-5" /><span>OFF THE BENCH</span></>
                      )}
                    </button>
                  </div>
                )}

                {/* Attending, confirmed */}
                {isConfirmed && (
                  <div className="space-y-1.5">

                    {/* ── Rider controls ── */}
                    {riderIsConfirmed ? (
                      // Has confirmed rider: offer or release to bench
                      <div className="flex gap-2">
                        {hasRiderBench ? (
                          <button
                            onClick={handleDropRider}
                            disabled={actionLoading === 'drop-rider'}
                            title="Pass Rider slot to the next player on the Rider bench"
                            className="flex-1 bg-dull-gold text-asphalt border-[3px] border-asphalt font-graffiti text-sm py-2.5 px-4 shadow-sticker-md hover:shadow-[6px_6px_0_var(--asphalt-black)] hover:translate-y-[-2px] active:shadow-sticker-sm active:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {actionLoading === 'drop-rider' ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <><UserMinus className="w-4 h-4" /><span>RELEASE RIDER</span></>
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleOfferRider(myRiderAttendance!.attendeeId)}
                            disabled={actionLoading === 'offer-rider'}
                            title="Put your Rider slot on the marketplace for anyone to claim"
                            className="flex-1 bg-dull-gold text-asphalt border-[3px] border-asphalt font-graffiti text-sm py-2.5 px-4 shadow-sticker-md hover:shadow-[6px_6px_0_var(--asphalt-black)] hover:translate-y-[-2px] active:shadow-sticker-sm active:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {actionLoading === 'offer-rider' ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <><Hand className="w-4 h-4" /><span>OFFER RIDER</span></>
                            )}
                          </button>
                        )}
                      </div>
                    ) : riderIsOffered ? (
                      // Rider is currently offered
                      <button
                        onClick={() => handleRetractRiderOffer(myRiderAttendance!.attendeeId)}
                        disabled={actionLoading === 'retract-rider'}
                        className="w-full bg-white text-asphalt border-[3px] border-asphalt font-graffiti text-sm py-2.5 px-5 shadow-sticker-md hover:shadow-[6px_6px_0_var(--asphalt-black)] hover:translate-y-[-2px] active:shadow-sticker-sm active:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {actionLoading === 'retract-rider' ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <><Undo2 className="w-4 h-4" /><span>RETRACT RIDER OFFER</span></>
                        )}
                      </button>
                    ) : onRiderBench ? (
                      // No rider, but rider is queued on bench
                      <div className="space-y-1">
                        <p className="text-xs text-asphalt/60 font-body text-center">
                          Your Rider is <span className="font-semibold">#{event.myRiderWaitlistPosition}</span> on the bench
                        </p>
                        <button
                          onClick={handleLeaveRiderWaitlist}
                          disabled={actionLoading === 'rider-waitlist-leave'}
                          className="w-full bg-white text-asphalt border-[3px] border-asphalt font-graffiti text-sm py-2.5 px-5 shadow-sticker-md hover:shadow-[6px_6px_0_var(--asphalt-black)] hover:translate-y-[-2px] active:shadow-sticker-sm active:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {actionLoading === 'rider-waitlist-leave' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <><UserMinus className="w-4 h-4" /><span>TAKE RIDER OFF BENCH</span></>
                          )}
                        </button>
                      </div>
                    ) : isSignupOpen ? (
                      // No rider, none on bench — bring one or queue on bench
                      availableSpots > 0 ? (
                        <button
                          onClick={handleAddRider}
                          disabled={actionLoading === 'add-rider'}
                          className="w-full bg-dull-gold text-asphalt border-[3px] border-asphalt font-graffiti text-base py-3 px-5 shadow-sticker-md hover:shadow-[6px_6px_0_var(--asphalt-black)] hover:translate-y-[-2px] active:shadow-sticker-sm active:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {actionLoading === 'add-rider' ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <><UserPlus className="w-5 h-5" /><span>BRING A RIDER</span></>
                          )}
                        </button>
                      ) : (
                        <button
                          onClick={handleJoinRiderWaitlist}
                          disabled={actionLoading === 'rider-waitlist-join'}
                          className="w-full bg-dull-gold/60 text-asphalt border-[3px] border-asphalt font-graffiti text-base py-3 px-5 shadow-sticker-md hover:shadow-[6px_6px_0_var(--asphalt-black)] hover:translate-y-[-2px] active:shadow-sticker-sm active:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {actionLoading === 'rider-waitlist-join' ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <><UserPlus className="w-5 h-5" /><span>PUT RIDER ON BENCH</span></>
                          )}
                        </button>
                      )
                    ) : null}

                    {/* ── Primary give-up: blocked while rider is confirmed ── */}
                    {riderIsConfirmed ? (
                      <p className="text-xs text-asphalt/60 font-body text-center">
                        Release or offer your Rider before offering your own spot.
                      </p>
                    ) : hasBench ? (
                      <button
                        onClick={handleRelease}
                        disabled={actionLoading === 'release'}
                        title="Passes your spot to the next player on the bench"
                        className="w-full bg-slate-blue text-white border-[3px] border-asphalt font-graffiti text-base py-3 px-5 shadow-sticker-md hover:shadow-[6px_6px_0_var(--asphalt-black)] hover:translate-y-[-2px] active:shadow-sticker-sm active:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {actionLoading === 'release' ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <><LogOut className="w-5 h-5" /><span>RELEASE</span></>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={handleOffer}
                        disabled={actionLoading === 'offer'}
                        title="Opens your spot for anyone in the crew to claim"
                        className="w-full bg-terracotta text-white border-[3px] border-asphalt font-graffiti text-base py-3 px-5 shadow-sticker-md hover:shadow-[6px_6px_0_var(--asphalt-black)] hover:translate-y-[-2px] active:shadow-sticker-sm active:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {actionLoading === 'offer' ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <><Hand className="w-5 h-5" /><span>OFFER</span></>
                        )}
                      </button>
                    )}

                    {/* Direct handover: targets primary row explicitly */}
                    {riderIsConfirmed && (
                      <p className="text-[10px] text-asphalt/50 font-body text-center">
                        To hand over your spot, release or offer your Rider first.
                      </p>
                    )}
                    <div className="flex gap-2">
                        <Select value={handoverEmail} onValueChange={setHandoverEmail}>
                          <SelectTrigger className="flex-1 bg-white border-2 border-asphalt rounded-none font-body text-xs h-9 focus:ring-0 focus:ring-offset-0 shadow-sticker-sm">
                            <SelectValue placeholder="Hand it to…" />
                          </SelectTrigger>
                          <SelectContent className="bg-sticker-white border-2 border-asphalt rounded-none">
                            {membersWithoutSpot.map((m) => (
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
                  </div>
                )}

                {/* Attending, offered → RETRACT OFFER */}
                {isOffered && (
                  <button
                    onClick={handleRetract}
                    disabled={actionLoading === 'retract'}
                    className="w-full bg-white text-asphalt border-[3px] border-asphalt font-graffiti text-lg py-3 px-5 shadow-sticker-md hover:shadow-[6px_6px_0_var(--asphalt-black)] hover:translate-y-[-2px] active:shadow-sticker-sm active:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {actionLoading === 'retract' ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <><Undo2 className="w-5 h-5" /><span>RETRACT OFFER</span></>
                    )}
                  </button>
                )}
              </div>

              {error && (
                <div className="p-2 bg-terracotta/10 border-2 border-terracotta">
                  <p className="text-sm text-terracotta font-body">{error}</p>
                </div>
              )}

              {/* Manager: edit / delete */}
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
                    {actionLoading === 'delete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Trash2 className="w-4 h-4" />DELETE</>}
                  </button>
                </div>
              )}

              {/* Manager: assign to open spot */}
              {canManage && availableSpots > 0 && (
                <div className="border-2 border-dashed border-asphalt/40 p-3 space-y-2">
                  <h3 className="font-graffiti text-sm text-asphalt">Assign a player</h3>
                  <div className="flex gap-2">
                    <Select value={assignEmail} onValueChange={setAssignEmail}>
                      <SelectTrigger className="flex-1 bg-white border-2 border-asphalt rounded-none font-body text-sm focus:ring-0 focus:ring-offset-0 shadow-sticker-sm">
                        <SelectValue placeholder="Select a player…" />
                      </SelectTrigger>
                      <SelectContent className="bg-sticker-white border-2 border-asphalt rounded-none">
                        {membersWithoutSpot.map((m) => (
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
                      {actionLoading === 'assign' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'ASSIGN'}
                    </button>
                  </div>
                </div>
              )}

              {/* Manager: Manage Squad */}
              {canManage && allAttendees.length > 0 && (
                <div className="border-2 border-dashed border-asphalt/40">
                  <button
                    type="button"
                    onClick={() => setManageSquadOpen((v) => !v)}
                    className="w-full flex items-center justify-between gap-2 p-3 text-left"
                  >
                    <span className="font-graffiti text-sm text-asphalt">
                      Manage Squad ({allAttendees.length})
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-asphalt flex-shrink-0 transition-transform ${manageSquadOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {manageSquadOpen && (
                    <div className="border-t-2 border-dashed border-asphalt/40 p-3 space-y-2">
                      {/* Show primary attendees first, then riders grouped below their owner */}
                      {[...primaryAttendees, ...allAttendees.filter(a => a.isPlusOne)].map((attendee) => {
                        const busy =
                          actionLoading === `reassign-${attendee.attendeeId}` ||
                          actionLoading === `unassign-${attendee.attendeeId}`;
                        const isRiderRow = attendee.isPlusOne;
                        const displayName = isRiderRow
                          ? `${attendee.userName}'s Rider`
                          : attendee.userName;

                        // Rider reassign: target must have primary but no rider yet
                        const riderHolderEmails = new Set(
                          allAttendees.filter(a => a.isPlusOne).map(a => a.userEmail)
                        );
                        const membersForRiderSwap = isRiderRow
                          ? primaryAttendees
                              .filter(a => a.userEmail !== attendee.userEmail && !riderHolderEmails.has(a.userEmail))
                              .map(a => members.find(m => m.userEmail === a.userEmail))
                              .filter(Boolean) as typeof members
                          : membersWithoutSpot;

                        // Show "+1" admin button only for non-rider primary holders without a rider
                        const hasRiderAlready = isRiderRow
                          ? false
                          : allAttendees.some(a => a.isPlusOne && a.userEmail === attendee.userEmail);

                        return (
                          <div
                            key={attendee.attendeeId}
                            className={`border-2 border-asphalt p-2 space-y-2 ${isRiderRow ? 'bg-dull-gold/10 ml-3' : 'bg-white'}`}
                          >
                            <span className="font-marker text-sm text-asphalt flex items-center gap-1.5 truncate">
                              {displayName}
                              {attendee.status === 'offered' && (
                                <span className="text-[10px] font-graffiti bg-terracotta text-white px-1 py-0.5 leading-none shrink-0">
                                  OFFERING
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
                                  {membersForRiderSwap.map((m) => (
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
                                ) : 'SWAP'}
                              </button>
                              {/* Add Rider: primary holders without a rider and capacity exists */}
                              {!isRiderRow && !hasRiderAlready && availableSpots > 0 && (
                                <button
                                  onClick={() => handleAdminAssignRider(attendee.userEmail)}
                                  disabled={!!actionLoading}
                                  title="Add a Rider (+1) for this player"
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
                                title={isRiderRow ? 'Remove Rider from game' : 'Remove player from game'}
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

              {/* Available (offered) spots */}
              {offeredSpots.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-graffiti text-lg text-terracotta">
                    Available Spots ({offeredSpots.length})
                  </h3>
                  <div className="space-y-2">
                    {offeredSpots.map((attendee, index) => {
                      const isRiderSpot = attendee.isPlusOne;
                      // A rider spot can be claimed by someone who has a primary but no rider
                      const canClaimAsRider =
                        isRiderSpot &&
                        event.isAttending &&
                        !myRiderAttendance &&
                        isSignupOpen;
                      const canClaimAsPrimary =
                        !isRiderSpot && !event.isAttending && isSignupOpen;
                      const canClaim = canClaimAsPrimary || canClaimAsRider;

                      return (
                        <div
                          key={attendee.attendeeId}
                          className="marker-card bg-terracotta/10 p-3 flex items-center justify-between"
                          style={{ transform: `rotate(${index % 2 === 0 ? -0.3 : 0.3}deg)` }}
                        >
                          <span className="font-marker text-terracotta flex items-center gap-1.5">
                            {renderRoleIcon(attendee.userEmail)}
                            {isRiderSpot ? `${attendee.userName}'s Rider` : `${attendee.userName}'s spot`}
                          </span>
                          {canClaim && (
                            <button
                              onClick={() => handleClaim(attendee.attendeeId)}
                              disabled={actionLoading === 'claim'}
                              className="bg-moss-green text-asphalt border-2 border-asphalt font-graffiti text-sm py-1.5 px-4 shadow-[3px_3px_0_var(--asphalt-black)] hover:shadow-sticker-md active:shadow-[1px_1px_0_var(--asphalt-black)] transition-all disabled:opacity-50"
                            >
                              {actionLoading === 'claim' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'CLAIM'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Playing section */}
              {(() => {
                // Group riders under their primary owner for display order
                const primaries = [...primaryAttendees];
                const riderRows = allAttendees.filter(a => a.isPlusOne);
                // Build ordered list: primary then their rider (if any)
                const displayList: typeof allAttendees = [];
                for (const p of primaries) {
                  displayList.push(p);
                  const rider = riderRows.find(r => r.userEmail === p.userEmail);
                  if (rider) displayList.push(rider);
                }
                // Any offered-only primaries already included; also add orphan riders (shouldn't exist)
                return (
                  <div className="space-y-2">
                    <h3 className="font-graffiti text-lg text-slate-blue">
                      Playing ({totalOccupancy}/{event.totalSpots})
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {displayList.map((attendee, index) => {
                        const isMe = attendee.userEmail.toLowerCase() === userEmail.toLowerCase();
                        const displayName = attendee.isPlusOne
                          ? `${attendee.userName}'s Rider`
                          : attendee.userName;
                        return (
                          <div
                            key={attendee.attendeeId}
                            className={`marker-card p-2 ${
                              isMe ? 'bg-moss-green border-asphalt' : 'bg-white'
                            } ${attendee.isPlusOne ? 'border-dull-gold/60' : ''}`}
                            style={{ transform: `rotate(${index % 2 === 0 ? -0.5 : 0.5}deg)` }}
                          >
                            <span className="font-marker text-sm text-asphalt truncate flex flex-wrap items-center gap-1.5">
                              {!attendee.isPlusOne && (
                                <PlayerAvatar
                                  pieceUrl={pieceByEmail.get(attendee.userEmail)}
                                  name={attendee.userName}
                                  className="h-6 w-6 shrink-0"
                                />
                              )}
                              {!attendee.isPlusOne && renderRoleIcon(attendee.userEmail)}
                              <span className="truncate">{displayName}</span>
                              {isMe && !attendee.isPlusOne && (
                                <span className="text-asphalt/60">(you)</span>
                              )}
                              {attendee.status === 'offered' && (
                                <span className="text-[10px] font-graffiti bg-terracotta text-white px-1 py-0.5 leading-none shrink-0">
                                  OFFERING
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      })}

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

              {/* Bench / Waitlist */}
              {waitlist.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-graffiti text-lg text-slate-blue">
                    The Bench ({waitlist.length})
                  </h3>
                  <div className="space-y-2">
                    {waitlist.map((entry, index) => (
                      <div
                        key={`${entry.userEmail}-${entry.forRider}`}
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
                          {entry.displayName}
                          {entry.userEmail === userEmail && (
                            <span className="text-asphalt/60">(you)</span>
                          )}
                          {entry.forRider && (
                            <span className="text-[10px] font-graffiti bg-dull-gold text-asphalt px-1 py-0.5 leading-none shrink-0">
                              +1
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
          eventType: event.eventType ?? 'regular',
          bannerUrl: event.bannerUrl,
          bannerOrientation: event.bannerOrientation,
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
