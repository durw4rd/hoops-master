"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader2, Search, UserPlus } from "lucide-react";

interface AvailableUser {
  email: string;
  displayName: string;
  onboarded: boolean;
}

interface AddMemberModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  onMemberAdded: () => void;
}

export default function AddMemberModal({
  open,
  onOpenChange,
  groupId,
  onMemberAdded,
}: AddMemberModalProps) {
  const [users, setUsers] = useState<AvailableUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchAvailable = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/members/available`);
      const data = await res.json();
      if (res.ok) setUsers(data.data || []);
      else setError(data.error || "Failed to load players");
    } catch {
      setError("Failed to load players");
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    if (open) {
      setQuery("");
      fetchAvailable();
    }
  }, [open, fetchAvailable]);

  const addMember = async (email: string) => {
    setAdding(email);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userEmail: email, groupRole: "member" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add member");
        return;
      }
      // Remove from the local list and notify parent.
      setUsers((prev) => prev.filter((u) => u.email !== email));
      onMemberAdded();
    } catch {
      setError("Failed to add member");
    } finally {
      setAdding(null);
    }
  };

  const filtered = users.filter((u) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="graffiti-dialog max-w-md mx-2 sm:mx-auto rounded-none max-h-[85vh] overflow-y-auto shadow-sticker-lg">
        <DialogHeader>
          <DialogTitle className="graffiti-dialog-title">Put &apos;Em On</DialogTitle>
          <DialogDescription className="text-asphalt/60 font-body">
            Pull a name from the yard and put them down with the crew — they don&apos;t even
            have to be signed in yet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-asphalt/40 pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the yard…"
              className="sketch-input"
              style={{ paddingLeft: "2.5rem" }}
            />
          </div>

          {error && (
            <div className="p-2 bg-terracotta/10 border-2 border-terracotta">
              <p className="text-sm text-terracotta font-body">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-asphalt/40" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-asphalt/50 font-body py-8">
              {users.length === 0 ? "Everyone's already in the crew." : "No players match your search."}
            </p>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {filtered.map((u) => (
                <div
                  key={u.email}
                  className="marker-card p-2.5 flex items-center justify-between bg-white"
                >
                  <div className="min-w-0">
                    <p className="font-marker text-asphalt truncate">
                      {u.displayName}
                      {!u.onboarded && (
                        <span className="ml-1 text-[10px] text-asphalt/50 font-graffiti">
                          not on yet
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-asphalt/50 font-body truncate">{u.email}</p>
                  </div>
                  <button
                    onClick={() => addMember(u.email)}
                    disabled={adding === u.email}
                    className="bg-moss-green text-asphalt border-2 border-asphalt font-graffiti text-sm py-1.5 px-3 shadow-[3px_3px_0_var(--asphalt-black)] hover:shadow-sticker-md active:shadow-[1px_1px_0_var(--asphalt-black)] transition-all disabled:opacity-50 flex items-center gap-1 flex-shrink-0"
                  >
                    {adding === u.email ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        ADD
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
