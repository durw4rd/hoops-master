"use client";

import { useState, useEffect } from "react";
import { Group } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Globe, Key, Loader2, Users, Check } from "lucide-react";

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#F2EFE9] border-4 border-[#1A1A1A] max-w-md mx-2 sm:mx-auto rounded-none max-h-[85vh] overflow-y-auto shadow-[8px_8px_0_#1A1A1A]">
        <DialogHeader>
          <DialogTitle className="font-graffiti text-2xl text-[#0084FF]">Join a Crew</DialogTitle>
          <DialogDescription className="text-[#1A1A1A]/60 font-body">
            Join using an invite code or browse public crews
          </DialogDescription>
        </DialogHeader>

        {/* Tab Buttons */}
        <div className="flex gap-2 bg-[#1A1A1A] p-1 mt-2">
          <button
            onClick={() => setActiveTab('code')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 font-graffiti text-sm transition-all ${
              activeTab === 'code' 
                ? 'bg-[#FF5A00] text-white' 
                : 'text-[#F2EFE9]/60 hover:text-[#F2EFE9]'
            }`}
          >
            <Key className="w-4 h-4" />
            Invite Code
          </button>
          <button
            onClick={() => setActiveTab('public')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 font-graffiti text-sm transition-all ${
              activeTab === 'public' 
                ? 'bg-[#96E600] text-[#1A1A1A]' 
                : 'text-[#F2EFE9]/60 hover:text-[#F2EFE9]'
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
              <Label htmlFor="code" className="font-graffiti text-[#1A1A1A]">Invite Code</Label>
              <Input
                id="code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="XXXXXXXX"
                className="sketch-input uppercase tracking-widest font-mono text-center text-xl"
                maxLength={8}
                required
              />
              <p className="text-xs text-[#1A1A1A]/40 font-body">
                Get the invite code from a crew admin
              </p>
            </div>

            {error && joiningGroupId === 'code' && (
              <div className="p-2 bg-[#FF5A00]/10 border-2 border-[#FF5A00]">
                <p className="text-sm text-[#FF5A00] font-body">{error}</p>
              </div>
            )}

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
                <Loader2 className="w-8 h-8 mx-auto text-[#0084FF] animate-spin" />
              </div>
            ) : availableGroups.length === 0 ? (
              <div className="py-8 text-center marker-card">
                <div className="w-16 h-16 mx-auto rounded-full bg-[#0084FF]/20 border-2 border-[#1A1A1A] flex items-center justify-center mb-3">
                  <Users className="w-8 h-8 text-[#0084FF]" />
                </div>
                <p className="font-graffiti text-[#1A1A1A]">No Public Crews</p>
                <p className="text-[#1A1A1A]/50 text-sm font-body mt-1">Check back later</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {availableGroups.map((group, index) => (
                  <div 
                    key={group.groupId}
                    className="marker-card p-3"
                    style={{ transform: `rotate(${index % 2 === 0 ? -0.3 : 0.3}deg)` }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-graffiti text-[#1A1A1A] truncate">
                          {group.name}
                        </h4>
                        {group.description && (
                          <p className="text-xs text-[#1A1A1A]/50 truncate font-body">
                            {group.description}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleJoinPublic(group.groupId)}
                        disabled={joiningGroupId === group.groupId}
                        className="sticker-btn-green text-sm py-2 px-3 flex items-center gap-1"
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
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {error && joiningGroupId !== 'code' && (
              <div className="p-2 bg-[#FF5A00]/10 border-2 border-[#FF5A00] mt-3">
                <p className="text-sm text-[#FF5A00] font-body">{error}</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
