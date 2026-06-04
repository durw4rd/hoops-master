"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useFlags } from "launchdarkly-react-client-sdk";
import { useState, useEffect, useCallback, useRef } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import GroupList from "@/components/groups/GroupList";
import CreateGroupModal from "@/components/groups/CreateGroupModal";
import JoinGroupModal from "@/components/groups/JoinGroupModal";
import GroupDashboard from "@/components/groups/GroupDashboard";
import OnboardingScreen from "@/components/OnboardingScreen";
import InvitePlayerModal from "@/components/InvitePlayerModal";
import ProfileSettingsModal from "@/components/ProfileSettingsModal";
import { Group, UserProfile } from "@/lib/types";
import { Plus, Users, BookText } from "lucide-react";
import Image from "next/image";

export default function HoopsMaster() {
  const { data: session, status } = useSession();
  // LD `app-admins` flag (JSON array of emails). DB role is still authoritative
  // server-side; this only mirrors the gate for UX.
  const flags = useFlags();
  const appAdmins: string[] = Array.isArray(flags?.appAdmins) ? flags.appAdmins : [];
  
  // User state
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  
  // Groups state
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  // Remember the last crew the user had open so we can land them there next session.
  const autoOpenedRef = useRef(false);
  const LAST_GROUP_KEY = "hoops:lastGroupId";
  
  // Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  // Sign-in error (e.g. invite-only access denied), read from the URL.
  const [authError, setAuthError] = useState<string | null>(null);
  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get("error");
    if (err) setAuthError(err);
  }, []);

  // Fetch user profile
  const fetchUserProfile = useCallback(async () => {
    if (!session?.user?.email) return;
    
    try {
      setProfileLoading(true);
      const res = await fetch('/api/user/profile');
      if (res.ok) {
        const data = await res.json();
        setUserProfile(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error);
    } finally {
      setProfileLoading(false);
    }
  }, [session?.user?.email]);

  // Fetch user's groups
  const fetchGroups = useCallback(async () => {
    if (!session?.user?.email) return;
    
    try {
      setGroupsLoading(true);
      const res = await fetch('/api/groups');
      if (res.ok) {
        const data = await res.json();
        setGroups(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch groups:', error);
    } finally {
      setGroupsLoading(false);
    }
  }, [session?.user?.email]);

  // Initial data fetch
  useEffect(() => {
    if (status === 'authenticated') {
      fetchUserProfile();
      fetchGroups();
    }
  }, [status, fetchUserProfile, fetchGroups]);

  // Once groups are loaded, jump straight to the last crew the user had open
  // (only on the first load of the session).
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (groupsLoading || groups.length === 0 || selectedGroup) return;
    autoOpenedRef.current = true;
    try {
      const lastId = localStorage.getItem(LAST_GROUP_KEY);
      if (lastId) {
        const match = groups.find((g) => g.groupId === lastId);
        if (match) setSelectedGroup(match);
      }
    } catch {
      // localStorage unavailable — fall back to the crews overview.
    }
  }, [groupsLoading, groups, selectedGroup]);

  // Persist the open crew so we can restore it next session.
  useEffect(() => {
    if (!selectedGroup) return;
    try {
      localStorage.setItem(LAST_GROUP_KEY, selectedGroup.groupId);
    } catch {
      // ignore
    }
  }, [selectedGroup]);

  // Handle group creation
  const handleGroupCreated = (newGroup: Group) => {
    setGroups(prev => [...prev, newGroup]);
    setCreateModalOpen(false);
    setSelectedGroup(newGroup);
    // Refresh profile so the new membership (creator = group admin) is reflected,
    // which gates the New Event button / Settings tab in the dashboard.
    fetchUserProfile();
  };

  // Handle joining a group
  const handleGroupJoined = (joinedGroup: Group) => {
    setGroups(prev => [...prev, joinedGroup]);
    setJoinModalOpen(false);
    fetchUserProfile();
  };

  // Handle group selection
  const handleSelectGroup = (group: Group) => {
    setSelectedGroup(group);
  };

  // Handle back to groups list
  const handleBackToGroups = () => {
    setSelectedGroup(null);
    // User chose the overview, so don't auto-reopen a crew this session or next.
    autoOpenedRef.current = true;
    try {
      localStorage.removeItem(LAST_GROUP_KEY);
    } catch {
      // ignore
    }
    fetchGroups(); // Refresh groups list
  };

  // Can the current user create crews? DB admin OR present in the LD app-admins flag.
  const userEmail = session?.user?.email?.toLowerCase() || '';
  const canCreateCrew =
    userProfile?.globalRole === 'admin' ||
    userProfile?.globalRole === 'owner' ||
    appAdmins.map((e) => e.toLowerCase()).includes(userEmail);

  // Loading state
  if (status === "loading") {
    return (
      <div className="min-h-screen concrete-bg flex flex-col">
        <Header 
          session={session} 
          onSignIn={() => signIn("google")} 
          onSignOut={signOut}
          userProfile={userProfile}
        />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="font-graffiti text-2xl text-[#FF5A00] animate-pulse">Loading...</div>
        </div>
        <Footer />
      </div>
    );
  }

  // Not authenticated
  if (!session) {
    return (
      <div className="min-h-screen concrete-bg flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-6">
            {/* Logo */}
            <Image
              src="/logo-clean-400.png"
              alt="Hoops Master"
              width={360}
              height={200}
              className="mx-auto drop-shadow-[4px_4px_0_rgba(0,0,0,0.3)]"
              priority
            />

            {/* Invite-only access denied */}
            {authError && (
              <div className="max-w-md mx-auto bg-[#FFD700] border-3 border-[#1A1A1A] p-3 shadow-[4px_4px_0_#1A1A1A]">
                <p className="font-graffiti text-[#1A1A1A]">
                  This app is invite-only.
                </p>
                <p className="text-sm text-[#1A1A1A]/70 font-body mt-1">
                  Ask an admin to invite your email, then sign in again.
                </p>
              </div>
            )}

            {/* Tagline */}
            <div className="space-y-2">
              <p className="font-marker text-xl sm:text-2xl text-[#0084FF] transform -rotate-1">
                Lace 'em up.
              </p>
              <p className="text-[#1A1A1A]/70 max-w-md mx-auto font-body">
                Run the court. Rep your crew. Never miss a run.
              </p>
            </div>
            
            {/* CTA Button */}
            <button 
              onClick={() => signIn("google")}
              className="sticker-btn text-xl py-4 px-8"
            >
              Get On The Court
            </button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // First-login onboarding: invited users must choose a username before using the app.
  if (!profileLoading && userProfile && !userProfile.onboarded) {
    return (
      <div className="min-h-screen concrete-bg flex flex-col">
        <Header
          session={session}
          onSignIn={() => signIn("google")}
          onSignOut={signOut}
          userProfile={userProfile}
        />
        <OnboardingScreen
          defaultUsername={userProfile.displayName}
          onComplete={() => {
            fetchUserProfile();
            fetchGroups();
          }}
        />
        <Footer />
      </div>
    );
  }

  // Show group dashboard if a group is selected
  if (selectedGroup) {
    return (
      <div className="min-h-screen concrete-bg flex flex-col">
        <Header 
          session={session} 
          onSignIn={() => signIn("google")} 
          onSignOut={signOut}
          onOpenProfile={() => setProfileModalOpen(true)}
          userProfile={userProfile}
          currentGroup={selectedGroup}
          onBackToGroups={handleBackToGroups}
        />
        <div className="flex-1">
          <GroupDashboard 
            group={selectedGroup} 
            userEmail={session.user?.email || ''}
            userProfile={userProfile}
            onGroupUpdated={(updatedGroup) => setSelectedGroup(updatedGroup)}
            onGroupDeleted={() => {
              setSelectedGroup(null);
              autoOpenedRef.current = true;
              try {
                localStorage.removeItem(LAST_GROUP_KEY);
              } catch {
                // ignore
              }
              fetchGroups();
              fetchUserProfile();
            }}
          />
        </div>
        <ProfileSettingsModal
          open={profileModalOpen}
          onOpenChange={setProfileModalOpen}
          currentDisplayName={userProfile?.displayName || session?.user?.name || ""}
          onSaved={() => fetchUserProfile()}
        />
        <Footer />
      </div>
    );
  }

  // Show groups list
  return (
    <div className="min-h-screen concrete-bg flex flex-col">
      <Header 
        session={session} 
        onSignIn={() => signIn("google")} 
        onSignOut={signOut}
        onOpenProfile={() => setProfileModalOpen(true)}
        userProfile={userProfile}
      />
      
      <div className="flex-1">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="font-graffiti text-3xl sm:text-4xl text-[#1A1A1A] tracking-wide">
                Your Crews
              </h2>
              <p className="text-[#1A1A1A]/60 text-sm mt-1 font-body">
                {groups.length === 0 
                  ? "Join or create a crew to get started"
                  : `${groups.length} crew${groups.length !== 1 ? 's' : ''}`
                }
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setJoinModalOpen(true)}
                className="sticker-btn-outline flex items-center gap-2"
              >
                <Users className="w-4 h-4" />
                Join
              </button>
              {canCreateCrew && (
                <button
                  onClick={() => setInviteModalOpen(true)}
                  className="sticker-btn-outline flex items-center gap-2"
                  title="Manage players — invites and admin roles"
                >
                  <BookText className="w-4 h-4" />
                  Black Book
                </button>
              )}
              {canCreateCrew && (
                <button
                  onClick={() => setCreateModalOpen(true)}
                  className="sticker-btn flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create
                </button>
              )}
            </div>
          </div>

          {/* Groups List */}
          <GroupList 
            groups={groups}
            loading={groupsLoading}
            onSelectGroup={handleSelectGroup}
            userEmail={session.user?.email || ''}
          />
        </div>
      </div>

        {/* Modals */}
      <CreateGroupModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onGroupCreated={handleGroupCreated}
      />
      
      <JoinGroupModal
        open={joinModalOpen}
        onOpenChange={setJoinModalOpen}
        onGroupJoined={handleGroupJoined}
        existingGroupIds={groups.filter(g => g?.groupId).map(g => g.groupId)}
      />

      <InvitePlayerModal
        open={inviteModalOpen}
        onOpenChange={setInviteModalOpen}
        currentUserEmail={session?.user?.email ?? undefined}
      />

      <ProfileSettingsModal
        open={profileModalOpen}
        onOpenChange={setProfileModalOpen}
        currentDisplayName={userProfile?.displayName || session?.user?.name || ""}
        onSaved={() => fetchUserProfile()}
      />

      <Footer />
    </div>
  );
}
