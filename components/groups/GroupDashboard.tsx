"use client";

import { useState, useEffect, useCallback } from "react";
import { Group, Event, UserProfile } from "@/lib/types";
import { 
  Calendar, 
  Users, 
  Settings, 
  Plus, 
  Clock,
  MapPin,
  ChevronRight,
  ChevronLeft,
  Copy,
  Check,
  Lock,
  Globe,
  Loader2,
  Wallet,
  Crown,
  Star,
  UserPlus,
  History,
} from "lucide-react";
import CreateEventModal from "./CreateEventModal";
import EventDetailModal from "./EventDetailModal";
import CreditDashboard from "./CreditDashboard";
import AddMemberModal from "./AddMemberModal";
import BannerUploadField from "./BannerUploadField";
import CrewMuralHero from "./CrewMuralHero";
import SettingsMenu from "@/components/SettingsMenu";
import PlayerAvatar from "@/components/PlayerAvatar";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { crewRoleLabel, isCapo as isCapoRole, isCrewManager } from "@/lib/roles";
import { Trash2 } from "lucide-react";

interface GroupDashboardProps {
  group: Group;
  userEmail: string;
  userProfile: UserProfile | null;
  session: any;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenProfile?: () => void;
  onBackToGroups?: () => void;
  onGroupUpdated: (group: Group) => void;
  onGroupDeleted?: (groupId: string) => void;
  initialOpenEventId?: string | null;
  onInitialEventConsumed?: () => void;
  onNotificationNavigate?: (groupId: string, eventId: string) => void;
}

interface EventWithCounts extends Event {
  attendeeCount: number;
  offeredCount: number;
  availableSpots: number;
  waitlistCount?: number;
  isAttending?: boolean;
  onWaitlist?: boolean;
  hasRider?: boolean;
}

interface MemberInfo {
  userEmail: string;
  displayName: string;
  pieceUrl?: string;
  groupRole: string;
  joinedAt: string;
}

export default function GroupDashboard({ 
  group, 
  userEmail, 
  userProfile,
  session,
  onSignIn,
  onSignOut,
  onOpenProfile,
  onBackToGroups,
  onGroupUpdated,
  onGroupDeleted,
  initialOpenEventId,
  onInitialEventConsumed,
  onNotificationNavigate,
}: GroupDashboardProps) {
  const [events, setEvents] = useState<EventWithCounts[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  useEffect(() => {
    if (initialOpenEventId) {
      setSelectedEventId(initialOpenEventId);
      setActiveTab('events');
      onInitialEventConsumed?.();
    }
  }, [initialOpenEventId, onInitialEventConsumed]);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [visibility, setVisibility] = useState(group.visibility);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [activeTab, setActiveTab] = useState<'events' | 'members' | 'credits' | 'settings'>('events');
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [roleUpdating, setRoleUpdating] = useState<string | null>(null);
  const [removeMemberEmail, setRemoveMemberEmail] = useState<string | null>(null);
  const [removingMember, setRemovingMember] = useState(false);
  const [removeMemberError, setRemoveMemberError] = useState<string | null>(null);
  const [deletingCrew, setDeletingCrew] = useState(false);
  const [confirmDeleteCrewOpen, setConfirmDeleteCrewOpen] = useState(false);
  const [gameFilter, setGameFilter] = useState<'all' | 'mine'>('all');
  const [showPast, setShowPast] = useState(false);
  const [piecePreview, setPiecePreview] = useState<{ url: string; name: string } | null>(null);

  // Editable crew-details form (Settings tab).
  const [editDescription, setEditDescription] = useState(group.description ?? '');
  const [editSpots, setEditSpots] = useState(String(group.defaultEventSpots ?? 10));
  const [editCost, setEditCost] = useState(String(group.defaultSlotCost ?? 0));
  const [editBannerUrl, setEditBannerUrl] = useState<string | undefined>(group.bannerUrl);
  const [editBannerOrientation, setEditBannerOrientation] = useState<'landscape' | 'portrait'>(
    group.bannerOrientation === 'portrait' ? 'portrait' : 'landscape'
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Crew roles: Capo (leader) has full control; Capo+King can manage events.
  const membership = userProfile?.groups.find(m => m.groupId === group.groupId);
  const isCapo = isCapoRole(membership?.groupRole ?? '');
  const canManage = isCrewManager(membership?.groupRole ?? '');
  const isOwner = userProfile?.globalRole === 'owner';
  const canDeleteCrew = isCapo || isOwner;

  const myGameCount = events.filter((e) => e.isAttending || e.onWaitlist).length;
  const visibleEvents = gameFilter === 'mine' ? events.filter((e) => e.isAttending || e.onWaitlist) : events;

  // Fetch events
  const fetchEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const url = `/api/groups/${group.groupId}/events${showPast ? '?includePast=true' : ''}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch events:', error);
    } finally {
      setEventsLoading(false);
    }
  }, [group.groupId, showPast]);

  // Fetch members
  const fetchMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/groups/${group.groupId}/members`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data.data?.members || []);
      }
    } catch (error) {
      console.error('Failed to fetch members:', error);
    } finally {
      setMembersLoading(false);
    }
  }, [group.groupId]);

  useEffect(() => {
    fetchEvents();
    fetchMembers();
  }, [fetchEvents, fetchMembers]);

  useEffect(() => {
    setEditDescription(group.description ?? "");
    setEditSpots(String(group.defaultEventSpots ?? 10));
    setEditCost(String(group.defaultSlotCost ?? 0));
    setEditBannerUrl(group.bannerUrl);
    setEditBannerOrientation(group.bannerOrientation === "portrait" ? "portrait" : "landscape");
    setVisibility(group.visibility);
  }, [group]);

  const copyInviteCode = async () => {
    if (group.inviteCode) {
      await navigator.clipboard.writeText(group.inviteCode);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    }
  };

  const handleVisibilityChange = async (newVisibility: 'public' | 'private') => {
    if (newVisibility === visibility) return;
    setSavingVisibility(true);
    try {
      const res = await fetch(`/api/groups/${group.groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: newVisibility }),
      });
      if (res.ok) {
        setVisibility(newVisibility);
        onGroupUpdated({ ...group, visibility: newVisibility });
      }
    } catch (error) {
      console.error('Failed to update visibility:', error);
    } finally {
      setSavingVisibility(false);
    }
  };

  const handleDeleteCrew = async () => {
    setDeletingCrew(true);
    try {
      const res = await fetch(`/api/groups/${group.groupId}`, { method: 'DELETE' });
      if (res.ok) {
        setConfirmDeleteCrewOpen(false);
        onGroupDeleted?.(group.groupId);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to delete crew');
      }
    } catch (error) {
      console.error('Failed to delete crew:', error);
      alert('Failed to delete crew');
    } finally {
      setDeletingCrew(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError(null);
    setSettingsSaved(false);
    setSavingSettings(true);
    try {
      const res = await fetch(`/api/groups/${group.groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: editDescription,
          defaultEventSpots: parseInt(editSpots) || group.defaultEventSpots,
          defaultSlotCost: parseFloat(editCost) || 0,
          bannerUrl: editBannerUrl ?? null,
          bannerOrientation: editBannerOrientation,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSettingsError(data.error || 'Failed to save crew details');
        return;
      }
      onGroupUpdated(data.data);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    } catch {
      setSettingsError('An unexpected error occurred');
    } finally {
      setSavingSettings(false);
    }
  };

  const changeMemberRole = async (userEmail: string, groupRole: 'coleader' | 'member') => {
    setRoleUpdating(userEmail);
    try {
      const res = await fetch(`/api/groups/${group.groupId}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userEmail, groupRole }),
      });
      if (res.ok) await fetchMembers();
    } catch (error) {
      console.error('Failed to update member role:', error);
    } finally {
      setRoleUpdating(null);
    }
  };

  const handleRemoveMember = async () => {
    if (!removeMemberEmail) return;
    setRemovingMember(true);
    setRemoveMemberError(null);
    try {
      const res = await fetch(`/api/groups/${group.groupId}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userEmail: removeMemberEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setRemoveMemberEmail(null);
        await fetchMembers();
      } else {
        setRemoveMemberError(data.error || 'Failed to remove member');
      }
    } catch (error) {
      console.error('Failed to remove member:', error);
      setRemoveMemberError('Failed to remove member');
    } finally {
      setRemovingMember(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 sm:py-6">
      {onBackToGroups && (
        <div className="sticky top-0 z-40 -mx-4 px-4 py-2 mb-3 flex items-center justify-between concrete-bg">
          <button
            type="button"
            onClick={onBackToGroups}
            className="flex items-center gap-1 text-asphalt hover:text-terracotta transition-colors font-graffiti text-base sm:text-lg"
            aria-label="Back to crews"
          >
            <ChevronLeft className="w-6 h-6 shrink-0" />
            Crews
          </button>
          <SettingsMenu
            session={session}
            userProfile={userProfile}
            onSignIn={onSignIn}
            onSignOut={onSignOut}
            onOpenProfile={onOpenProfile}
            onNotificationNavigate={onNotificationNavigate}
          />
        </div>
      )}

      <CrewMuralHero group={group} memberCount={members.length} eventCount={events.length} />

      {/* Tabs */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Tab Buttons */}
          <div className="flex gap-1 sm:gap-2 bg-asphalt p-1 border-2 border-asphalt shadow-sticker-sm overflow-x-auto">
            <button
              onClick={() => setActiveTab('events')}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 font-graffiti text-xs sm:text-sm transition-all shrink-0 ${
                activeTab === 'events' 
                  ? 'bg-terracotta text-white' 
                  : 'text-sticker-white hover:bg-asphalt/80'
              }`}
            >
              <Calendar className="w-4 h-4 shrink-0" aria-hidden />
              <span>Events</span>
            </button>
            <button
              onClick={() => setActiveTab('members')}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 font-graffiti text-xs sm:text-sm transition-all shrink-0 ${
                activeTab === 'members' 
                  ? 'bg-purple-accent text-white' 
                  : 'text-sticker-white hover:bg-asphalt/80'
              }`}
            >
              <Users className="w-4 h-4 shrink-0" aria-hidden />
              <span>Players</span>
            </button>
            <button
              onClick={() => setActiveTab('credits')}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 font-graffiti text-xs sm:text-sm transition-all shrink-0 ${
                activeTab === 'credits'
                  ? 'bg-dull-gold text-asphalt'
                  : 'text-sticker-white hover:bg-asphalt/80'
              }`}
            >
              <Wallet className="w-4 h-4 shrink-0" aria-hidden />
              <span>Balances</span>
            </button>
            {(canManage || isOwner) && (
              <button
                onClick={() => setActiveTab('settings')}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 font-graffiti text-xs sm:text-sm transition-all shrink-0 ${
                  activeTab === 'settings' 
                    ? 'bg-moss-green text-asphalt' 
                    : 'text-sticker-white hover:bg-asphalt/80'
                }`}
              >
                <Settings className="w-4 h-4 shrink-0" aria-hidden />
                <span>Settings</span>
              </button>
            )}
          </div>

          {canManage && activeTab === 'events' && (
            <button
              onClick={() => setCreateEventOpen(true)}
              className="sticker-btn flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              <Plus className="w-4 h-4" />
              Drop a Game
            </button>
          )}
        </div>

        {/* Events Tab */}
        {activeTab === 'events' && (
          <div className="space-y-3">
            {!eventsLoading && (
              <div
                className={`grid gap-2 items-stretch ${
                  events.length > 0 ? 'grid-cols-3' : 'grid-cols-1'
                }`}
              >
                {events.length > 0 && (
                  <>
                    <button
                      onClick={() => setGameFilter('all')}
                      className={`h-full flex items-center justify-center text-center leading-tight px-3 py-2 font-graffiti text-sm border-2 border-asphalt transition-all ${
                        gameFilter === 'all'
                          ? 'bg-asphalt text-sticker-white'
                          : 'bg-white text-asphalt hover:bg-sticker-white'
                      }`}
                    >
                      All Games ({events.length})
                    </button>
                    <button
                      onClick={() => setGameFilter('mine')}
                      className={`h-full flex items-center justify-center text-center leading-tight px-3 py-2 font-graffiti text-sm border-2 border-asphalt transition-all ${
                        gameFilter === 'mine'
                          ? 'bg-moss-green text-asphalt'
                          : 'bg-white text-asphalt hover:bg-sticker-white'
                      }`}
                    >
                      My Games ({myGameCount})
                    </button>
                  </>
                )}
                <button
                  onClick={() => setShowPast((v) => !v)}
                  className={`h-full flex items-center justify-center gap-1.5 text-center leading-tight px-3 py-2 font-graffiti text-sm border-2 border-asphalt transition-all ${
                    showPast
                      ? 'bg-dull-gold text-asphalt'
                      : 'bg-white text-asphalt hover:bg-sticker-white'
                  }`}
                >
                  <History className="w-3.5 h-3.5 shrink-0" />
                  {showPast ? 'Hide Past Games' : 'Show Past Games'}
                </button>
              </div>
            )}
            {eventsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="marker-card p-4 animate-pulse">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-asphalt/10 rounded" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-32 bg-asphalt/10 rounded" />
                        <div className="h-3 w-48 bg-asphalt/5 rounded" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : visibleEvents.length === 0 ? (
              <div className="marker-card p-8 border-dashed border-asphalt/30">
                <div className="text-center space-y-4">
                  <div className="w-20 h-20 mx-auto rounded-full bg-terracotta/20 border-3 border-asphalt flex items-center justify-center">
                    <Calendar className="w-10 h-10 text-terracotta" />
                  </div>
                  <div>
                    <h3 className="font-graffiti text-2xl text-asphalt">
                      {gameFilter === 'mine' ? "You're Not In Any Games" : 'No Games Yet!'}
                    </h3>
                    <p className="text-asphalt/60 text-sm mt-2 font-body">
                      {gameFilter === 'mine'
                        ? 'Jump into a game and it’ll show up here'
                        : canManage
                        ? 'Create your first event to get started'
                        : 'Check back later for new games'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleEvents.map((event, index) => (
                  <div 
                    key={event.eventId}
                    className={`marker-card p-4 hover:shadow-sticker-soft-lg transition-all cursor-pointer group ${
                      event.isAttending ? 'border-l-[6px] border-l-moss-green' : event.onWaitlist ? 'border-l-[6px] border-l-slate-blue' : ''
                    }`}
                    style={{ transform: `rotate(${index % 2 === 0 ? -0.3 : 0.3}deg)` }}
                    onClick={() => setSelectedEventId(event.eventId)}
                  >
                    <div className="flex items-center gap-3 sm:gap-4">
                      {/* Date block */}
                      <div className="w-14 h-14 sm:w-16 sm:h-16 bg-terracotta border-2 border-asphalt flex flex-col items-center justify-center flex-shrink-0 shadow-sticker-sm">
                        <span className="text-[9px] sm:text-[10px] text-white font-graffiti uppercase">
                          {new Date(event.date).toLocaleDateString('en-US', { weekday: 'short' })}
                        </span>
                        <span className="text-xl sm:text-2xl font-graffiti text-white">
                          {new Date(event.date).getDate()}
                        </span>
                      </div>

                      {/* Event info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
                          <Clock className="w-4 h-4 text-slate-blue" />
                          <span className="font-graffiti text-asphalt text-base sm:text-lg">
                            {event.startTime} - {event.endTime}
                          </span>
                          {event.isAttending && (
                            <>
                              <span className="badge-green text-[10px]">YOU&apos;RE IN</span>
                              {event.hasRider && (
                                <span className="text-[10px] font-graffiti bg-dull-gold text-asphalt px-1.5 py-0.5 border border-asphalt">+1</span>
                              )}
                            </>
                          )}
                          {!event.isAttending && event.onWaitlist && (
                            <span className="badge-blue text-[10px]">ON THE BENCH</span>
                          )}
                          {event.eventType && event.eventType !== 'regular' && (
                            <span className="tag-label-blue text-[10px] transform rotate-0 hidden sm:inline-block">
                              {event.eventType.toUpperCase()}
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-asphalt/60 font-body">
                          {event.location && (
                            <span className="flex items-center gap-1 truncate max-w-[100px] sm:max-w-none">
                              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                              <span className="truncate">{event.location}</span>
                            </span>
                          )}
                          <span className="flex items-center gap-1 font-graffiti text-asphalt">
                            <Users className="w-3.5 h-3.5" />
                            {event.availableSpots <= 0 ? 'FULL' : `${event.attendeeCount}/${event.totalSpots}`}
                          </span>
                          {event.offeredCount > 0 && (
                            <span className="badge-green text-[10px]">
                              {event.offeredCount} OPEN
                            </span>
                          )}
                          {event.availableSpots <= 0 && (event.waitlistCount ?? 0) > 0 && (
                            <span className="badge-blue text-[10px]">
                              {event.waitlistCount} ON THE BENCH
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="w-10 h-10 rounded-full bg-slate-blue border-2 border-asphalt flex items-center justify-center group-hover:bg-terracotta transition-colors flex-shrink-0 shadow-sticker-sm">
                        <ChevronRight className="w-5 h-5 text-white" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Members Tab */}
        {activeTab === 'members' && (
          <div className="space-y-3">
            {canManage && (
              <button
                onClick={() => setAddMemberOpen(true)}
                className="sticker-btn-blue flex items-center justify-center gap-2 w-full sm:w-auto"
              >
                <UserPlus className="w-4 h-4" />
                Put &apos;Em On
              </button>
            )}
            {membersLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="marker-card p-3 animate-pulse">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-asphalt/10" />
                      <div className="space-y-1.5 flex-1">
                        <div className="h-4 w-32 bg-asphalt/10 rounded" />
                        <div className="h-3 w-48 bg-asphalt/5 rounded" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-2">
                {members.map((member, index) => (
                  <div 
                    key={member.userEmail} 
                    className="marker-card p-3"
                    style={{ transform: `rotate(${index % 2 === 0 ? -0.2 : 0.2}deg)` }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            member.pieceUrl &&
                            setPiecePreview({ url: member.pieceUrl, name: member.displayName || member.userEmail })
                          }
                          className={member.pieceUrl ? "cursor-pointer" : "cursor-default"}
                          aria-label={member.pieceUrl ? `View ${member.displayName}'s piece` : undefined}
                        >
                          <PlayerAvatar
                            pieceUrl={member.pieceUrl}
                            name={member.displayName || member.userEmail}
                            className={`h-10 w-10 shadow-sticker-sm ${member.pieceUrl ? "hover:ring-2 hover:ring-terracotta transition-all" : ""}`}
                          />
                        </button>
                        <div>
                          <p className="font-marker text-asphalt">
                            {member.displayName}
                          </p>
                          <p className="text-xs text-asphalt/50 font-body">
                            {crewRoleLabel(member.groupRole)}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {member.groupRole === 'admin' && (
                          <span className="badge-orange flex items-center gap-1">
                            <Crown className="w-3 h-3" /> CAPO
                          </span>
                        )}
                        {member.groupRole === 'coleader' && (
                          <span className="badge-purple flex items-center gap-1">
                            <Star className="w-3 h-3" /> KING
                          </span>
                        )}
                        {member.userEmail === userEmail && (
                          <span className="badge-green">YOU</span>
                        )}
                        {/* Capo-only role controls (cannot target other Capos) */}
                        {isCapo && member.groupRole !== 'admin' && (
                          roleUpdating === member.userEmail ? (
                            <Loader2 className="w-4 h-4 animate-spin text-asphalt/60" />
                          ) : member.groupRole === 'coleader' ? (
                            <button
                              onClick={() => changeMemberRole(member.userEmail, 'member')}
                              className="text-xs font-graffiti border-2 border-asphalt bg-white px-2 py-1 shadow-sticker-sm hover:bg-sticker-white transition-colors"
                            >
                              Demote
                            </button>
                          ) : (
                            <button
                              onClick={() => changeMemberRole(member.userEmail, 'coleader')}
                              className="text-xs font-graffiti border-2 border-asphalt bg-purple-accent text-white px-2 py-1 shadow-sticker-sm hover:bg-purple-accent/90 transition-colors flex items-center gap-1"
                            >
                              <Star className="w-3 h-3" /> Make King
                            </button>
                          )
                        )}
                        {/* Capo can remove any non-Capo, non-self member */}
                        {isCapo && member.groupRole !== 'admin' && member.userEmail !== userEmail && (
                          <button
                            onClick={() => { setRemoveMemberError(null); setRemoveMemberEmail(member.userEmail); }}
                            title={`Remove ${member.displayName} from crew`}
                            className="text-terracotta hover:text-terracotta/70 transition-colors"
                            aria-label={`Remove ${member.displayName}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Credits Tab */}
        {activeTab === 'credits' && (
          <CreditDashboard
            groupId={group.groupId}
            userEmail={userEmail}
            isGroupAdmin={canManage}
            members={members}
          />
        )}

        {/* Settings Tab (Capo/King or Owner) */}
        {activeTab === 'settings' && (canManage || isOwner) && (
          <div className="space-y-4">
            <div className="marker-card p-4">
              <h3 className="font-graffiti text-xl text-asphalt mb-4">Visibility</h3>
              <div className="space-y-2">
                <div 
                  onClick={() => !savingVisibility && handleVisibilityChange('private')}
                  className={`flex items-center space-x-3 p-3 border-2 border-asphalt cursor-pointer transition-all ${visibility === 'private' ? 'bg-asphalt text-sticker-white' : 'bg-white hover:bg-sticker-white'} ${savingVisibility ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${visibility === 'private' ? 'border-sticker-white' : 'border-asphalt'}`}>
                    {visibility === 'private' && <div className="w-2 h-2 rounded-full bg-current" />}
                  </div>
                  <Lock className="w-4 h-4" />
                  <div className="flex-1">
                    <span className="font-graffiti">Private</span>
                    <p className={`text-xs font-body ${visibility === 'private' ? 'text-sticker-white/60' : 'text-asphalt/60'}`}>Members can only join via invite code</p>
                  </div>
                </div>
                <div 
                  onClick={() => !savingVisibility && handleVisibilityChange('public')}
                  className={`flex items-center space-x-3 p-3 border-2 border-asphalt cursor-pointer transition-all ${visibility === 'public' ? 'bg-moss-green' : 'bg-white hover:bg-sticker-white'} ${savingVisibility ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center border-asphalt`}>
                    {visibility === 'public' && <div className="w-2 h-2 rounded-full bg-asphalt" />}
                  </div>
                  <Globe className="w-4 h-4" />
                  <div className="flex-1">
                    <span className="font-graffiti">Public</span>
                    <p className={`text-xs font-body ${visibility === 'public' ? 'text-asphalt/70' : 'text-asphalt/60'}`}>Anyone can find and join this group</p>
                  </div>
                </div>
              </div>
              {savingVisibility && (
                <div className="flex items-center gap-2 mt-3 text-sm text-asphalt/60 font-body">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </div>
              )}
            </div>

            <div className="marker-card p-4">
              <h3 className="font-graffiti text-xl text-asphalt mb-4">Invite Code</h3>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-asphalt px-4 py-3 border-2 border-asphalt">
                  <p className="text-terracotta font-graffiti text-2xl sm:text-3xl tracking-widest text-center">
                    {group.inviteCode}
                  </p>
                </div>
                <button
                  onClick={copyInviteCode}
                  className="sticker-btn-blue p-3"
                >
                  {inviteCopied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-xs text-asphalt/50 mt-2 font-body">Share this code to invite members</p>
            </div>

            <form onSubmit={handleSaveSettings} className="marker-card p-4 space-y-4">
              <h3 className="font-graffiti text-xl text-asphalt">Crew Details</h3>

              <div className="space-y-2">
                <Label className="font-graffiti text-asphalt">Crew Banner</Label>
                <BannerUploadField
                  value={editBannerUrl}
                  onChange={setEditBannerUrl}
                  orientation={editBannerOrientation}
                  onOrientationChange={setEditBannerOrientation}
                  groupId={group.groupId}
                />
                <p className="text-xs text-asphalt/50 font-body">
                  Portrait banners display as a cropped mural on the crew page. List cards use the side column layout.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="crew-description" className="font-graffiti text-asphalt">
                  Description
                </Label>
                <Textarea
                  id="crew-description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="What's this crew about?"
                  className="sketch-input resize-none"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="crew-spots" className="font-graffiti text-asphalt">
                    Default Spots
                  </Label>
                  <Input
                    id="crew-spots"
                    type="number"
                    min="1"
                    max="50"
                    value={editSpots}
                    onChange={(e) => setEditSpots(e.target.value)}
                    className="sketch-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="crew-cost" className="font-graffiti text-asphalt">
                    Default Cost
                  </Label>
                  <Input
                    id="crew-cost"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editCost}
                    onChange={(e) => setEditCost(e.target.value)}
                    className="sketch-input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm font-body pt-1">
                <div>
                  <label className="text-xs text-asphalt/50">Timezone</label>
                  <p className="font-graffiti text-asphalt">{group.timezone}</p>
                </div>
                <div>
                  <label className="text-xs text-asphalt/50">Round-Robin Slide</label>
                  <p className="font-graffiti text-asphalt">{group.roundRobinSlide}</p>
                </div>
              </div>

              {settingsError && (
                <div className="p-3 bg-terracotta/10 border-2 border-terracotta">
                  <p className="text-sm text-terracotta font-body">{settingsError}</p>
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="sticker-btn flex items-center gap-2 disabled:opacity-50"
                >
                  {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Save Details
                </button>
                {settingsSaved && (
                  <span className="font-graffiti text-sm text-[#1A9A3A] flex items-center gap-1">
                    <Check className="w-4 h-4" />
                    Saved!
                  </span>
                )}
              </div>
            </form>

            {canDeleteCrew && (
              <div className="marker-card p-4 border-terracotta">
                <h3 className="font-graffiti text-xl text-terracotta mb-2">Burn It Down</h3>
                <p className="text-sm text-asphalt/70 font-body mb-3">
                  Delete this crew for good — games, waitlists, ledger and payments all go with it.
                  No take-backs.
                  {isOwner && !isCapo && (
                    <span className="block mt-1 text-asphalt/50">You can do this as the Owner.</span>
                  )}
                </p>
                <button
                  onClick={() => setConfirmDeleteCrewOpen(true)}
                  disabled={deletingCrew}
                  className="sticker-btn flex items-center gap-2 disabled:opacity-50"
                >
                  {deletingCrew ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  Delete Crew
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Event Modal */}
      <CreateEventModal
        open={createEventOpen}
        onOpenChange={setCreateEventOpen}
        groupId={group.groupId}
        defaultSpots={group.defaultEventSpots}
        defaultCost={group.defaultSlotCost}
        members={members.map((m) => ({ userEmail: m.userEmail, displayName: m.displayName }))}
        roundRobinSlide={group.roundRobinSlide}
        onEventCreated={() => {
          setCreateEventOpen(false);
          fetchEvents();
        }}
      />

      {/* Add Member Modal */}
      <AddMemberModal
        open={addMemberOpen}
        onOpenChange={setAddMemberOpen}
        groupId={group.groupId}
        onMemberAdded={() => {
          fetchMembers();
        }}
      />

      {/* Event Detail Modal */}
      {selectedEventId && (
        <EventDetailModal
          open={!!selectedEventId}
          onOpenChange={(open) => !open && setSelectedEventId(null)}
          groupId={group.groupId}
          eventId={selectedEventId}
          userEmail={userEmail}
          canManage={canManage}
          onEventUpdated={fetchEvents}
        />
      )}

      {/* Piece (avatar) full-size preview */}
      <Dialog open={!!piecePreview} onOpenChange={(open) => !open && setPiecePreview(null)}>
        <DialogContent className="p-0 border-4 border-asphalt shadow-sticker-lg bg-asphalt max-w-xs sm:max-w-sm rounded-none overflow-hidden">
          {piecePreview && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={piecePreview.url}
                alt={`${piecePreview.name}'s piece`}
                className="w-full h-auto object-cover"
              />
              <div className="px-4 py-3 bg-asphalt">
                <p className="font-graffiti text-xl text-sticker-white tracking-wide leading-tight">
                  {piecePreview.name}
                </p>
                <p className="font-marker text-moss-green text-xs mt-0.5">Their piece</p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDeleteCrewOpen}
        onOpenChange={setConfirmDeleteCrewOpen}
        title="Burn It Down?"
        message={`Delete the crew "${group.name}" for good? This wipes its games, waitlists, ledger and payments. No take-backs.`}
        confirmLabel="BURN IT"
        onConfirm={handleDeleteCrew}
        loading={deletingCrew}
      />

      {/* Remove member confirm dialog */}
      {removeMemberEmail && (() => {
        const target = members.find((m) => m.userEmail === removeMemberEmail);
        return (
          <ConfirmDialog
            open={!!removeMemberEmail}
            onOpenChange={(open) => { if (!open) { setRemoveMemberEmail(null); setRemoveMemberError(null); } }}
            title="Boot 'Em?"
            message={
              removeMemberError
                ? removeMemberError
                : `Remove ${target?.displayName ?? removeMemberEmail} from the crew? Their credit history stays on the books.`
            }
            confirmLabel={removeMemberError ? 'OK' : 'BOOT EM'}
            cancelLabel="Nevermind"
            onConfirm={removeMemberError ? () => { setRemoveMemberEmail(null); setRemoveMemberError(null); } : handleRemoveMember}
            loading={removingMember}
          />
        );
      })()}
    </div>
  );
}
