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
  Copy,
  Check,
  Lock,
  Globe,
  Loader2,
  Wallet,
  Crown,
  Star,
  UserPlus,
  ChevronDown,
  History,
} from "lucide-react";
import CreateEventModal from "./CreateEventModal";
import EventDetailModal from "./EventDetailModal";
import CreditDashboard from "./CreditDashboard";
import AddMemberModal from "./AddMemberModal";
import BannerUploadField from "./BannerUploadField";
import PlayerAvatar from "@/components/PlayerAvatar";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { crewRoleLabel, isCapo as isCapoRole, isCrewManager } from "@/lib/roles";
import { Trash2 } from "lucide-react";

interface GroupDashboardProps {
  group: Group;
  userEmail: string;
  userProfile: UserProfile | null;
  onGroupUpdated: (group: Group) => void;
  onGroupDeleted?: (groupId: string) => void;
}

interface EventWithCounts extends Event {
  attendeeCount: number;
  offeredCount: number;
  availableSpots: number;
  waitlistCount?: number;
  isAttending?: boolean;
  onWaitlist?: boolean;
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
  onGroupUpdated,
  onGroupDeleted,
}: GroupDashboardProps) {
  const [events, setEvents] = useState<EventWithCounts[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [visibility, setVisibility] = useState(group.visibility);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [activeTab, setActiveTab] = useState<'events' | 'members' | 'credits' | 'settings'>('events');
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [roleUpdating, setRoleUpdating] = useState<string | null>(null);
  const [deletingCrew, setDeletingCrew] = useState(false);
  const [confirmDeleteCrewOpen, setConfirmDeleteCrewOpen] = useState(false);
  const [gameFilter, setGameFilter] = useState<'all' | 'mine'>('all');
  const [showPast, setShowPast] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

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

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 sm:py-6">
      {/* Group Info Card (collapsible, collapsed by default) */}
      <Collapsible open={infoOpen} onOpenChange={setInfoOpen} className="marker-card mb-4 sm:mb-6">
        <CollapsibleTrigger className="w-full flex items-center justify-between gap-3 p-4 text-left">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="font-graffiti text-lg text-[#1A1A1A] truncate">{group.name}</span>
            <span className="badge-purple flex items-center gap-1 text-[10px]">
              <Users className="w-3 h-3" />
              {members.length}
            </span>
            <span className="badge-blue flex items-center gap-1 text-[10px]">
              <Calendar className="w-3 h-3" />
              {events.length}
            </span>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-[#1A1A1A] flex-shrink-0 transition-transform ${infoOpen ? 'rotate-180' : ''}`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-3">
            {group.description && (
              <p className="text-[#1A1A1A]/70 font-body">{group.description}</p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <span className="badge-purple flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {members.length} MEMBERS
                </span>
                <span className="badge-blue flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {events.length} EVENTS
                </span>
              </div>

              {isCapo && group.inviteCode && (
                <button
                  onClick={copyInviteCode}
                  className="flex items-center gap-2 bg-[#1A1A1A] text-[#F2EFE9] px-3 py-1.5 border-2 border-[#1A1A1A] font-mono text-sm hover:bg-[#FF5A00] transition-colors"
                >
                  {inviteCopied ? (
                    <Check className="w-4 h-4 text-[#96E600]" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  {group.inviteCode}
                </button>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Tabs */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Tab Buttons */}
          <div className="flex gap-2 bg-[#1A1A1A] p-1 rounded">
            <button
              onClick={() => setActiveTab('events')}
              className={`flex items-center gap-2 px-4 py-2 font-graffiti text-sm transition-all ${
                activeTab === 'events' 
                  ? 'bg-[#FF6B1A] text-white' 
                  : 'text-[#F2EFE9]/60 hover:text-[#F2EFE9]'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">Events</span>
            </button>
            <button
              onClick={() => setActiveTab('members')}
              className={`flex items-center gap-2 px-4 py-2 font-graffiti text-sm transition-all ${
                activeTab === 'members' 
                  ? 'bg-[#8B5CF6] text-white' 
                  : 'text-[#F2EFE9]/60 hover:text-[#F2EFE9]'
              }`}
            >
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Players</span>
            </button>
            <button
              onClick={() => setActiveTab('credits')}
              className={`flex items-center gap-2 px-4 py-2 font-graffiti text-sm transition-all ${
                activeTab === 'credits'
                  ? 'bg-[#FFD700] text-[#1A1A1A]'
                  : 'text-[#F2EFE9]/60 hover:text-[#F2EFE9]'
              }`}
            >
              <Wallet className="w-4 h-4" />
              <span className="hidden sm:inline">Balances</span>
            </button>
            {(canManage || isOwner) && (
              <button
                onClick={() => setActiveTab('settings')}
                className={`flex items-center gap-2 px-4 py-2 font-graffiti text-sm transition-all ${
                  activeTab === 'settings' 
                    ? 'bg-[#7FFF00] text-[#1A1A1A]' 
                    : 'text-[#F2EFE9]/60 hover:text-[#F2EFE9]'
                }`}
              >
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline">Settings</span>
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
                      className={`h-full flex items-center justify-center text-center leading-tight px-3 py-2 font-graffiti text-sm border-2 border-[#1A1A1A] transition-all ${
                        gameFilter === 'all'
                          ? 'bg-[#1A1A1A] text-[#F2EFE9]'
                          : 'bg-white text-[#1A1A1A] hover:bg-[#F2EFE9]'
                      }`}
                    >
                      All Games ({events.length})
                    </button>
                    <button
                      onClick={() => setGameFilter('mine')}
                      className={`h-full flex items-center justify-center text-center leading-tight px-3 py-2 font-graffiti text-sm border-2 border-[#1A1A1A] transition-all ${
                        gameFilter === 'mine'
                          ? 'bg-[#96E600] text-[#1A1A1A]'
                          : 'bg-white text-[#1A1A1A] hover:bg-[#F2EFE9]'
                      }`}
                    >
                      My Games ({myGameCount})
                    </button>
                  </>
                )}
                <button
                  onClick={() => setShowPast((v) => !v)}
                  className={`h-full flex items-center justify-center gap-1.5 text-center leading-tight px-3 py-2 font-graffiti text-sm border-2 border-[#1A1A1A] transition-all ${
                    showPast
                      ? 'bg-[#FFD700] text-[#1A1A1A]'
                      : 'bg-white text-[#1A1A1A] hover:bg-[#F2EFE9]'
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
                      <div className="w-14 h-14 bg-[#1A1A1A]/10 rounded" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-32 bg-[#1A1A1A]/10 rounded" />
                        <div className="h-3 w-48 bg-[#1A1A1A]/5 rounded" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : visibleEvents.length === 0 ? (
              <div className="marker-card p-8 border-dashed border-[#1A1A1A]/30">
                <div className="text-center space-y-4">
                  <div className="w-20 h-20 mx-auto rounded-full bg-[#FF5A00]/20 border-3 border-[#1A1A1A] flex items-center justify-center">
                    <Calendar className="w-10 h-10 text-[#FF5A00]" />
                  </div>
                  <div>
                    <h3 className="font-graffiti text-2xl text-[#1A1A1A]">
                      {gameFilter === 'mine' ? "You're Not In Any Games" : 'No Games Yet!'}
                    </h3>
                    <p className="text-[#1A1A1A]/60 text-sm mt-2 font-body">
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
                    className={`marker-card p-4 hover:shadow-[6px_6px_0_rgba(26,26,26,0.2)] transition-all cursor-pointer group ${
                      event.isAttending ? 'border-l-[6px] border-l-[#96E600]' : event.onWaitlist ? 'border-l-[6px] border-l-[#0084FF]' : ''
                    }`}
                    style={{ transform: `rotate(${index % 2 === 0 ? -0.3 : 0.3}deg)` }}
                    onClick={() => setSelectedEventId(event.eventId)}
                  >
                    <div className="flex items-center gap-3 sm:gap-4">
                      {/* Date block */}
                      <div className="w-14 h-14 sm:w-16 sm:h-16 bg-[#FF5A00] border-2 border-[#1A1A1A] flex flex-col items-center justify-center flex-shrink-0 shadow-[2px_2px_0_#1A1A1A]">
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
                          <Clock className="w-4 h-4 text-[#0084FF]" />
                          <span className="font-graffiti text-[#1A1A1A] text-base sm:text-lg">
                            {event.startTime} - {event.endTime}
                          </span>
                          {event.isAttending && (
                            <span className="badge-green text-[10px]">YOU&apos;RE IN</span>
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
                        
                        <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-[#1A1A1A]/60 font-body">
                          {event.location && (
                            <span className="flex items-center gap-1 truncate max-w-[100px] sm:max-w-none">
                              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                              <span className="truncate">{event.location}</span>
                            </span>
                          )}
                          <span className="flex items-center gap-1 font-graffiti text-[#1A1A1A]">
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

                      <div className="w-10 h-10 rounded-full bg-[#0084FF] border-2 border-[#1A1A1A] flex items-center justify-center group-hover:bg-[#FF5A00] transition-colors flex-shrink-0 shadow-[2px_2px_0_#1A1A1A]">
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
                      <div className="w-10 h-10 rounded-full bg-[#1A1A1A]/10" />
                      <div className="space-y-1.5 flex-1">
                        <div className="h-4 w-32 bg-[#1A1A1A]/10 rounded" />
                        <div className="h-3 w-48 bg-[#1A1A1A]/5 rounded" />
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
                        <PlayerAvatar
                          pieceUrl={member.pieceUrl}
                          name={member.displayName || member.userEmail}
                          className="h-10 w-10 shadow-[2px_2px_0_#1A1A1A]"
                        />
                        <div>
                          <p className="font-marker text-[#1A1A1A]">
                            {member.displayName}
                          </p>
                          <p className="text-xs text-[#1A1A1A]/50 font-body">
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
                            <Loader2 className="w-4 h-4 animate-spin text-[#1A1A1A]/60" />
                          ) : member.groupRole === 'coleader' ? (
                            <button
                              onClick={() => changeMemberRole(member.userEmail, 'member')}
                              className="text-xs font-graffiti border-2 border-[#1A1A1A] bg-white px-2 py-1 shadow-[2px_2px_0_#1A1A1A] hover:bg-[#F2EFE9] transition-colors"
                            >
                              Demote
                            </button>
                          ) : (
                            <button
                              onClick={() => changeMemberRole(member.userEmail, 'coleader')}
                              className="text-xs font-graffiti border-2 border-[#1A1A1A] bg-[#8B5CF6] text-white px-2 py-1 shadow-[2px_2px_0_#1A1A1A] hover:bg-[#7c4ddb] transition-colors flex items-center gap-1"
                            >
                              <Star className="w-3 h-3" /> Make King
                            </button>
                          )
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
            isGroupAdmin={isCapo}
            members={members}
          />
        )}

        {/* Settings Tab (Capo/King or Owner) */}
        {activeTab === 'settings' && (canManage || isOwner) && (
          <div className="space-y-4">
            <div className="marker-card p-4">
              <h3 className="font-graffiti text-xl text-[#1A1A1A] mb-4">Visibility</h3>
              <div className="space-y-2">
                <div 
                  onClick={() => !savingVisibility && handleVisibilityChange('private')}
                  className={`flex items-center space-x-3 p-3 border-2 border-[#1A1A1A] cursor-pointer transition-all ${visibility === 'private' ? 'bg-[#1A1A1A] text-[#F2EFE9]' : 'bg-white hover:bg-[#F2EFE9]'} ${savingVisibility ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${visibility === 'private' ? 'border-[#F2EFE9]' : 'border-[#1A1A1A]'}`}>
                    {visibility === 'private' && <div className="w-2 h-2 rounded-full bg-current" />}
                  </div>
                  <Lock className="w-4 h-4" />
                  <div className="flex-1">
                    <span className="font-graffiti">Private</span>
                    <p className={`text-xs font-body ${visibility === 'private' ? 'text-[#F2EFE9]/60' : 'text-[#1A1A1A]/60'}`}>Members can only join via invite code</p>
                  </div>
                </div>
                <div 
                  onClick={() => !savingVisibility && handleVisibilityChange('public')}
                  className={`flex items-center space-x-3 p-3 border-2 border-[#1A1A1A] cursor-pointer transition-all ${visibility === 'public' ? 'bg-[#7FFF00]' : 'bg-white hover:bg-[#F2EFE9]'} ${savingVisibility ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center border-[#1A1A1A]`}>
                    {visibility === 'public' && <div className="w-2 h-2 rounded-full bg-[#1A1A1A]" />}
                  </div>
                  <Globe className="w-4 h-4" />
                  <div className="flex-1">
                    <span className="font-graffiti">Public</span>
                    <p className={`text-xs font-body ${visibility === 'public' ? 'text-[#1A1A1A]/70' : 'text-[#1A1A1A]/60'}`}>Anyone can find and join this group</p>
                  </div>
                </div>
              </div>
              {savingVisibility && (
                <div className="flex items-center gap-2 mt-3 text-sm text-[#1A1A1A]/60 font-body">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </div>
              )}
            </div>

            <div className="marker-card p-4">
              <h3 className="font-graffiti text-xl text-[#1A1A1A] mb-4">Invite Code</h3>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-[#1A1A1A] px-4 py-3 border-2 border-[#1A1A1A]">
                  <p className="text-[#FF5A00] font-graffiti text-2xl sm:text-3xl tracking-widest text-center">
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
              <p className="text-xs text-[#1A1A1A]/50 mt-2 font-body">Share this code to invite members</p>
            </div>

            <form onSubmit={handleSaveSettings} className="marker-card p-4 space-y-4">
              <h3 className="font-graffiti text-xl text-[#1A1A1A]">Crew Details</h3>

              <div className="space-y-2">
                <Label className="font-graffiti text-[#1A1A1A]">Crew Banner</Label>
                <BannerUploadField
                  value={editBannerUrl}
                  onChange={setEditBannerUrl}
                  orientation={editBannerOrientation}
                  onOrientationChange={setEditBannerOrientation}
                  groupId={group.groupId}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="crew-description" className="font-graffiti text-[#1A1A1A]">
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
                  <Label htmlFor="crew-spots" className="font-graffiti text-[#1A1A1A]">
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
                  <Label htmlFor="crew-cost" className="font-graffiti text-[#1A1A1A]">
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
                  <label className="text-xs text-[#1A1A1A]/50">Timezone</label>
                  <p className="font-graffiti text-[#1A1A1A]">{group.timezone}</p>
                </div>
                <div>
                  <label className="text-xs text-[#1A1A1A]/50">Round-Robin Slide</label>
                  <p className="font-graffiti text-[#1A1A1A]">{group.roundRobinSlide}</p>
                </div>
              </div>

              {settingsError && (
                <div className="p-3 bg-[#FF5A00]/10 border-2 border-[#FF5A00]">
                  <p className="text-sm text-[#FF5A00] font-body">{settingsError}</p>
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
              <div className="marker-card p-4 border-[#FF5A00]">
                <h3 className="font-graffiti text-xl text-[#FF5A00] mb-2">Burn It Down</h3>
                <p className="text-sm text-[#1A1A1A]/70 font-body mb-3">
                  Delete this crew for good — games, waitlists, ledger and payments all go with it.
                  No take-backs.
                  {isOwner && !isCapo && (
                    <span className="block mt-1 text-[#1A1A1A]/50">You can do this as the Owner.</span>
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

      <ConfirmDialog
        open={confirmDeleteCrewOpen}
        onOpenChange={setConfirmDeleteCrewOpen}
        title="Burn It Down?"
        message={`Delete the crew "${group.name}" for good? This wipes its games, waitlists, ledger and payments. No take-backs.`}
        confirmLabel="BURN IT"
        onConfirm={handleDeleteCrew}
        loading={deletingCrew}
      />
    </div>
  );
}
