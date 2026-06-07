"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useFlags } from "launchdarkly-react-client-sdk";
import { useState, useEffect, useCallback, useRef } from "react";
import AppShell from "@/components/AppShell";
import LogoBanner from "@/components/LogoBanner";
import GroupList from "@/components/groups/GroupList";
import CreateGroupModal from "@/components/groups/CreateGroupModal";
import JoinGroupModal from "@/components/groups/JoinGroupModal";
import GroupDashboard from "@/components/groups/GroupDashboard";
import OnboardingScreen from "@/components/OnboardingScreen";
import InvitePlayerModal from "@/components/InvitePlayerModal";
import ProfileSettingsModal from "@/components/ProfileSettingsModal";
import VocabModal from "@/components/VocabModal";
import { Group, UserProfile } from "@/lib/types";
import { Plus, Users } from "lucide-react";
import Image from "next/image";

const shellProps = (
  session: ReturnType<typeof useSession>["data"],
  userProfile: UserProfile | null
) => ({
  session,
  onSignIn: () => signIn("google"),
  onSignOut: signOut,
  userProfile,
});

const logoBannerProps = (
  session: ReturnType<typeof useSession>["data"],
  userProfile: UserProfile | null,
  options?: { onOpenProfile?: () => void; onOpenBlackBook?: () => void; onOpenVocab?: () => void }
) => ({
  session,
  userProfile,
  onSignIn: () => signIn("google"),
  onSignOut: signOut,
  onOpenProfile: options?.onOpenProfile,
  onOpenBlackBook: options?.onOpenBlackBook,
  onOpenVocab: options?.onOpenVocab,
});

export default function HoopsMaster() {
  const { data: session, status } = useSession();
  const flags = useFlags();
  const appAdmins: string[] = Array.isArray(flags?.appAdmins) ? flags.appAdmins : [];

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const autoOpenedRef = useRef(false);
  const LAST_GROUP_KEY = "hoops:lastGroupId";

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [vocabModalOpen, setVocabModalOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [chooseAccount, setChooseAccount] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) setAuthError(err);
    if (params.get("chooseAccount") === "1") setChooseAccount(true);
  }, []);

  // After signing out via "Try a different account", auto-trigger Google
  // sign-in with prompt:select_account so the browser doesn't silently reuse
  // the previous Google session.
  useEffect(() => {
    if (chooseAccount && status === "unauthenticated") {
      signIn("google", { callbackUrl: "/" }, { prompt: "select_account" });
    }
  }, [chooseAccount, status]);

  const fetchUserProfile = useCallback(async () => {
    if (!session?.user?.email) return;
    try {
      setProfileLoading(true);
      const res = await fetch("/api/user/profile");
      if (res.ok) {
        const data = await res.json();
        setUserProfile(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch profile:", error);
    } finally {
      setProfileLoading(false);
    }
  }, [session?.user?.email]);

  const fetchGroups = useCallback(async () => {
    if (!session?.user?.email) return;
    try {
      setGroupsLoading(true);
      const res = await fetch("/api/groups");
      if (res.ok) {
        const data = await res.json();
        setGroups(data.data || []);
      }
    } catch (error) {
      console.error("Failed to fetch groups:", error);
    } finally {
      setGroupsLoading(false);
    }
  }, [session?.user?.email]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchUserProfile();
      fetchGroups();
    }
  }, [status, fetchUserProfile, fetchGroups]);

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
      // localStorage unavailable
    }
  }, [groupsLoading, groups, selectedGroup]);

  useEffect(() => {
    if (!selectedGroup) return;
    try {
      localStorage.setItem(LAST_GROUP_KEY, selectedGroup.groupId);
    } catch {
      // ignore
    }
  }, [selectedGroup]);

  const handleGroupCreated = (newGroup: Group) => {
    setGroups((prev) => [...prev, newGroup]);
    setCreateModalOpen(false);
    setSelectedGroup(newGroup);
    fetchUserProfile();
  };

  const handleGroupJoined = (joinedGroup: Group) => {
    setGroups((prev) => [...prev, joinedGroup]);
    setJoinModalOpen(false);
    fetchUserProfile();
  };

  const handleSelectGroup = (group: Group) => {
    setSelectedGroup(group);
  };

  const handleBackToGroups = () => {
    setSelectedGroup(null);
    autoOpenedRef.current = true;
    try {
      localStorage.removeItem(LAST_GROUP_KEY);
    } catch {
      // ignore
    }
    fetchGroups();
  };

  const handleGroupUpdated = (updatedGroup: Group) => {
    setSelectedGroup(updatedGroup);
    setGroups((prev) =>
      prev.map((g) => (g.groupId === updatedGroup.groupId ? updatedGroup : g))
    );
  };

  const userEmail = session?.user?.email?.toLowerCase() || "";
  const canCreateCrew =
    userProfile?.globalRole === "admin" ||
    userProfile?.globalRole === "owner" ||
    appAdmins.map((e) => e.toLowerCase()).includes(userEmail);

  const profileModal = session ? (
    <ProfileSettingsModal
      open={profileModalOpen}
      onOpenChange={setProfileModalOpen}
      currentDisplayName={userProfile?.displayName || session?.user?.name || ""}
      currentPieceUrl={userProfile?.pieceUrl}
      onSaved={() => fetchUserProfile()}
    />
  ) : null;

  if (status === "loading") {
    return (
      <AppShell {...shellProps(session, userProfile)}>
        <div className="max-w-4xl mx-auto px-4 py-4 sm:py-6">
          <LogoBanner {...logoBannerProps(session, userProfile)} />
          <div className="flex items-center justify-center py-24">
            <div className="font-graffiti text-2xl text-terracotta animate-pulse">Loading...</div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!session) {
    return (
      <AppShell {...shellProps(session, userProfile)}>
        <div className="flex flex-col items-center justify-center px-4 py-16 min-h-[70vh]">
          <Image
            src="/logo-new-400.png"
            alt="Hoops Master"
            width={400}
            height={223}
            className="mx-auto w-full max-w-sm h-auto drop-shadow-[4px_4px_0_rgba(0,0,0,0.2)]"
            priority
          />

          {authError && (
            <div className="w-full max-w-sm space-y-3 mt-6">
              <div className="bg-dull-gold border-[3px] border-asphalt p-3 shadow-sticker-md">
                <p className="font-graffiti text-asphalt">This app is invite-only.</p>
                <p className="text-sm text-asphalt/70 font-body mt-1">
                  Ask an admin to invite your email, then sign in again.
                </p>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/?chooseAccount=1" })}
                className="sticker-btn-outline w-full text-base py-2.5 px-6"
              >
                Try a different account
              </button>
            </div>
          )}

          <button
            onClick={() => signIn("google")}
            className="sticker-btn text-xl py-4 px-8 mt-8"
          >
            Get On The Court
          </button>
        </div>
      </AppShell>
    );
  }

  if (!profileLoading && userProfile && !userProfile.onboarded) {
    return (
      <AppShell {...shellProps(session, userProfile)}>
        <div className="max-w-4xl mx-auto px-4 py-4 sm:py-6">
          <LogoBanner {...logoBannerProps(session, userProfile, { onOpenProfile: () => setProfileModalOpen(true), onOpenVocab: () => setVocabModalOpen(true) })} />
          <OnboardingScreen
            defaultUsername={userProfile.displayName}
            onComplete={() => {
              fetchUserProfile();
              fetchGroups();
            }}
          />
        </div>
        <VocabModal open={vocabModalOpen} onOpenChange={setVocabModalOpen} />
        {profileModal}
      </AppShell>
    );
  }

  if (selectedGroup) {
    return (
      <AppShell {...shellProps(session, userProfile)}>
        <GroupDashboard
          group={selectedGroup}
          userEmail={session.user?.email || ""}
          userProfile={userProfile}
          session={session}
          onSignIn={() => signIn("google")}
          onSignOut={signOut}
          onOpenProfile={() => setProfileModalOpen(true)}
          onBackToGroups={handleBackToGroups}
          onGroupUpdated={handleGroupUpdated}
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
        {profileModal}
      </AppShell>
    );
  }

  return (
    <AppShell {...shellProps(session, userProfile)}>
      <div className="max-w-4xl mx-auto px-4 py-4 sm:py-6">
          <LogoBanner
            {...logoBannerProps(session, userProfile, {
              onOpenProfile: () => setProfileModalOpen(true),
              onOpenBlackBook: canCreateCrew ? () => setInviteModalOpen(true) : undefined,
              onOpenVocab: () => setVocabModalOpen(true),
            })}
          />

        <div className={`grid gap-2 mb-6 ${canCreateCrew ? "grid-cols-2" : "grid-cols-1"}`}>
          <button
            onClick={() => setJoinModalOpen(true)}
            className="sticker-btn-outline flex items-center justify-center gap-1.5 text-sm py-2 px-3"
          >
            <Users className="w-4 h-4 shrink-0" />
            Join
          </button>
          {canCreateCrew && (
            <button
              onClick={() => setCreateModalOpen(true)}
              className="sticker-btn flex items-center justify-center gap-1.5 text-sm py-2 px-3"
            >
              <Plus className="w-4 h-4 shrink-0" />
              Create
            </button>
          )}
        </div>

        <GroupList
          groups={groups}
          loading={groupsLoading}
          onSelectGroup={handleSelectGroup}
          userEmail={session.user?.email || ""}
        />
      </div>

      <CreateGroupModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onGroupCreated={handleGroupCreated}
      />

      <JoinGroupModal
        open={joinModalOpen}
        onOpenChange={setJoinModalOpen}
        onGroupJoined={handleGroupJoined}
        existingGroupIds={groups.filter((g) => g?.groupId).map((g) => g.groupId)}
      />

      <InvitePlayerModal
        open={inviteModalOpen}
        onOpenChange={setInviteModalOpen}
        currentUserEmail={session?.user?.email ?? undefined}
      />

      <VocabModal open={vocabModalOpen} onOpenChange={setVocabModalOpen} />

      {profileModal}
    </AppShell>
  );
}
