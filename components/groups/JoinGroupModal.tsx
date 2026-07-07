"use client";

import { useState, useEffect } from "react";
import { Group } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Globe, Key, Loader2, Users, Check } from "lucide-react";
import Image from "next/image";
import { GraffitiDialog, GraffitiErrorBox } from "@/components/ui/GraffitiDialog";

interface JoinGroupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGroupJoined: (group: Group) => void;
  existingGroupIds: string[];
}

export default function JoinGroupModal({ 
  open, 
  onOpenChange, 
  onGroupJoined,
  existingGroupIds 
}: JoinGroupModalProps) {
  const [inviteCode, setInviteCode] = useState("");
  const [publicGroups, setPublicGroups] = useState<Group[]>([]);
  const [loadingPublic, setLoadingPublic] = useState(false);
  const [joiningGroupId, setJoiningGroupId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'code' | 'public'>('code');

  useEffect(() => {
    if (open) {
      fetchPublicGroups();
    }
  }, [open]);

  const fetchPublicGroups = async () => {
    setLoadingPublic(true);
    try {
      const res = await fetch('/api/groups/public');
      if (res.ok) {
        const data = await res.json();
        setPublicGroups(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch public groups:', err);
    } finally {
      setLoadingPublic(false);
    }
  };

  const handleJoinWithCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setJoiningGroupId('code');

    try {
      const res = await fetch('/api/groups/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: inviteCode.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to join group');
        return;
      }

      setInviteCode("");
      onGroupJoined(data.data.group);
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setJoiningGroupId(null);
    }
  };

  const handleJoinPublic = async (groupId: string) => {
    setError(null);
    setJoiningGroupId(groupId);

    try {
      const res = await fetch('/api/groups/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to join group');
        return;
      }

      onGroupJoined(data.data.group);
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setJoiningGroupId(null);
    }
  };

  const availableGroups = publicGroups.filter(g => !existingGroupIds.includes(g.groupId));

  return (
    <GraffitiDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Join a Crew"
      description="Join using an invite code or browse public crews"
      titleClassName="text-slate-blue"
      className="max-w-md"
    >

        {/* Tab Buttons */}
        <div className="flex gap-2 bg-asphalt p-1 mt-2">
          <button
            onClick={() => setActiveTab('code')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 font-graffiti text-sm transition-all ${
              activeTab === 'code' 
                ? 'bg-terracotta text-white' 
                : 'text-sticker-white/60 hover:text-sticker-white'
            }`}
          >
            <Key className="w-4 h-4" />
            Invite Code
          </button>
          <button
            onClick={() => setActiveTab('public')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 font-graffiti text-sm transition-all ${
              activeTab === 'public' 
                ? 'bg-moss-green text-asphalt' 
                : 'text-sticker-white/60 hover:text-sticker-white'
            }`}
          >
            <Globe className="w-4 h-4" />
            Public Crews
          </button>
        </div>

        {/* Invite Code Tab */}
        {activeTab === 'code' && (
          <form onSubmit={handleJoinWithCode} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="code" className="font-graffiti text-asphalt">Invite Code</Label>
              <Input
                id="code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="XXXXXXXX"
                className="sketch-input uppercase tracking-widest font-mono text-center text-xl"
                maxLength={8}
                required
              />
              <p className="text-xs text-asphalt/40 font-body">
                Get the invite code from a crew admin
              </p>
            </div>

            {error && joiningGroupId === "code" && <GraffitiErrorBox>{error}</GraffitiErrorBox>}

            <button
              type="submit"
              disabled={joiningGroupId === 'code' || inviteCode.length < 8}
              className="sticker-btn w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {joiningGroupId === 'code' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                  Joining...
                </>
              ) : (
                'Join Crew'
              )}
            </button>
          </form>
        )}

        {/* Public Groups Tab */}
        {activeTab === 'public' && (
          <div className="mt-4">
            {loadingPublic ? (
              <div className="py-8 text-center">
                <Loader2 className="w-8 h-8 mx-auto text-slate-blue animate-spin" />
              </div>
            ) : availableGroups.length === 0 ? (
              <div className="py-8 text-center marker-card">
                <div className="w-16 h-16 mx-auto rounded-full bg-slate-blue/20 border-2 border-asphalt flex items-center justify-center mb-3">
                  <Users className="w-8 h-8 text-slate-blue" />
                </div>
                <p className="font-graffiti text-asphalt">No Public Crews</p>
                <p className="text-asphalt/50 text-sm font-body mt-1">Check back later</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto overflow-x-hidden pr-0.5">
                {availableGroups.map((group, index) => {
                  const isPortrait =
                    !!group.bannerUrl && group.bannerOrientation === "portrait";
                  const rotation = `rotate(${index % 2 === 0 ? -0.3 : 0.3}deg)`;

                  const joinButton = (
                    <button
                      onClick={() => handleJoinPublic(group.groupId)}
                      disabled={joiningGroupId === group.groupId}
                      className="sticker-btn-green text-sm py-2 px-3 flex items-center justify-center gap-1 w-full sm:w-auto sm:self-start"
                    >
                      {joiningGroupId === group.groupId ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          Join
                        </>
                      )}
                    </button>
                  );

                  const details = (
                    <div className="min-w-0 space-y-2">
                      <div className="min-w-0">
                        <h4 className="font-graffiti text-asphalt line-clamp-2 break-words">
                          {group.name}
                        </h4>
                        {group.description && (
                          <p className="text-xs text-asphalt/50 line-clamp-2 break-words font-body mt-1">
                            {group.description}
                          </p>
                        )}
                      </div>
                      {joinButton}
                    </div>
                  );

                  if (isPortrait) {
                    return (
                      <div
                        key={group.groupId}
                        className="poster-frame p-0 overflow-hidden w-full min-w-0 flex"
                        style={{ transform: rotation }}
                      >
                        <div className="relative w-20 shrink-0 self-stretch border-r-2 border-asphalt overflow-hidden">
                          <Image
                            src={group.bannerUrl!}
                            alt={group.name}
                            fill
                            className="object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0 p-3">{details}</div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={group.groupId}
                      className="poster-frame p-0 overflow-hidden w-full min-w-0"
                      style={{ transform: rotation }}
                    >
                      {group.bannerUrl && (
                        <div className="relative h-20 w-full overflow-hidden border-b-2 border-asphalt grain-overlay">
                          <Image
                            src={group.bannerUrl}
                            alt={group.name}
                            fill
                            className="object-cover"
                          />
                        </div>
                      )}
                      <div className="p-3">{details}</div>
                    </div>
                  );
                })}
              </div>
            )}
            
            {error && joiningGroupId !== "code" && (
              <div className="mt-3">
                <GraffitiErrorBox>{error}</GraffitiErrorBox>
              </div>
            )}
          </div>
        )}
    </GraffitiDialog>
  );
}
