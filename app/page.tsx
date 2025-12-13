"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import GroupList from "@/components/groups/GroupList";
import CreateGroupModal from "@/components/groups/CreateGroupModal";
import JoinGroupModal from "@/components/groups/JoinGroupModal";
import GroupDashboard from "@/components/groups/GroupDashboard";
import { Group, UserProfile } from "@/lib/types";
import { Plus, Users } from "lucide-react";
import Image from "next/image";

export default function HoopsMaster() {
  const { data: session, status } = useSession();
  
  // User state
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  
  // Groups state
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  
  // Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);

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

  // Handle group creation
  const handleGroupCreated = (newGroup: Group) => {
    setGroups(prev => [...prev, newGroup]);
    setCreateModalOpen(false);
    setSelectedGroup(newGroup);
  };

  // Handle joining a group
  const handleGroupJoined = (joinedGroup: Group) => {
    setGroups(prev => [...prev, joinedGroup]);
    setJoinModalOpen(false);
  };

  // Handle group selection
  const handleSelectGroup = (group: Group) => {
    setSelectedGroup(group);
  };

  // Handle back to groups list
  const handleBackToGroups = () => {
    setSelectedGroup(null);
    fetchGroups(); // Refresh groups list
  };

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
        <Header 
          session={session} 
          onSignIn={() => signIn("google")} 
          onSignOut={signOut}
          userProfile={null}
        />
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
            
            {/* Tagline */}
            <div className="space-y-2">
              <p className="font-marker text-xl sm:text-2xl text-[#0084FF] transform -rotate-1">
                Get in the game!
              </p>
              <p className="text-[#1A1A1A]/70 max-w-md mx-auto font-body">
                Organize sports events, manage your crew, and never miss a game.
              </p>
            </div>
            
            {/* CTA Button */}
            <button 
              onClick={() => signIn("google")}
              className="sticker-btn text-xl py-4 px-8"
            >
              🏀 Sign in with Google
            </button>
          </div>
        </div>
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
          />
        </div>
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
              {userProfile?.globalRole === 'admin' && (
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

      <Footer />
    </div>
  );
}
