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
import { Label } from "@/components/ui/label";
import { Loader2, Mail, Check, Clock, Crown, ShieldCheck, ChevronUp, ChevronDown } from "lucide-react";

interface InvitePlayerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserEmail?: string;
}

interface InviteUser {
  email: string;
  displayName: string;
  globalRole: string;
  onboarded: boolean;
  invitedAt: string | null;
}

export default function InvitePlayerModal({
  open,
  onOpenChange,
  currentUserEmail,
}: InvitePlayerModalProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [users, setUsers] = useState<InviteUser[]>([]);
  const [roleUpdating, setRoleUpdating] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/invite");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchUsers();
      setError(null);
      setSuccess(null);
    }
  }, [open, fetchUsers]);

  const changeRole = async (targetEmail: string, role: "admin" | "user") => {
    setRoleUpdating(targetEmail);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/role", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update role");
        return;
      }
      setSuccess(data.message || "Role updated");
      fetchUsers();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setRoleUpdating(null);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to invite");
        return;
      }
      setSuccess(data.message || "Invited");
      setEmail("");
      fetchUsers();
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#F2EFE9] border-4 border-[#1A1A1A] max-w-md max-h-[85vh] overflow-y-auto mx-2 sm:mx-auto rounded-none shadow-[8px_8px_0_#1A1A1A]">
        <DialogHeader>
          <DialogTitle className="font-graffiti text-2xl text-[#FF5A00]">Invite a Player</DialogTitle>
          <DialogDescription className="font-body text-[#1A1A1A]/70">
            Only invited emails can sign in. The player picks their username when they first
            sign in with Google.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleInvite} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="invite-email" className="font-graffiti text-[#1A1A1A]">
              Email
            </Label>
            <div className="flex gap-2">
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="player@gmail.com"
                className="sketch-input flex-1"
              />
              <button
                type="submit"
                disabled={loading || !email}
                className="sticker-btn flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Invite
              </button>
            </div>
          </div>

          {error && (
            <div className="p-2 bg-[#FF5A00]/10 border-2 border-[#FF5A00]">
              <p className="text-sm text-[#FF5A00] font-body">{error}</p>
            </div>
          )}
          {success && (
            <div className="p-2 bg-[#7FFF00]/20 border-2 border-[#1A1A1A]">
              <p className="text-sm text-[#1A1A1A] font-body">{success}</p>
            </div>
          )}
        </form>

        <div className="space-y-2">
          <h3 className="font-graffiti text-lg text-[#1A1A1A]">Players ({users.length})</h3>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {users.map((u) => (
              <div
                key={u.email}
                className="flex items-center justify-between gap-2 bg-white border-2 border-[#1A1A1A] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-marker text-sm text-[#1A1A1A] truncate flex items-center gap-1">
                    {u.onboarded ? u.displayName : u.email.split("@")[0]}
                    {u.globalRole === "owner" && (
                      <span className="text-[10px] text-[#FF5A00] font-graffiti flex items-center gap-0.5">
                        <Crown className="w-3 h-3" /> OWNER
                      </span>
                    )}
                    {u.globalRole === "admin" && (
                      <span className="text-[10px] text-[#FF5A00] font-graffiti flex items-center gap-0.5">
                        <ShieldCheck className="w-3 h-3" /> ADMIN
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-[#1A1A1A]/50 font-body truncate">{u.email}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {u.onboarded ? (
                    <span className="hidden sm:flex items-center gap-1 text-[#0a8f3c] font-graffiti text-xs whitespace-nowrap">
                      <Check className="w-3.5 h-3.5" /> active
                    </span>
                  ) : (
                    <span className="hidden sm:flex items-center gap-1 text-[#1A1A1A]/50 font-graffiti text-xs whitespace-nowrap">
                      <Clock className="w-3.5 h-3.5" /> invited
                    </span>
                  )}
                  {/* Role controls — Owner is protected; can't change own role here. */}
                  {u.globalRole !== "owner" &&
                    u.email.toLowerCase() !== (currentUserEmail ?? "").toLowerCase() &&
                    (roleUpdating === u.email ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#1A1A1A]/60" />
                    ) : u.globalRole === "admin" ? (
                      <button
                        onClick={() => changeRole(u.email, "user")}
                        title="Demote to Player"
                        className="text-[11px] font-graffiti border-2 border-[#1A1A1A] bg-white px-2 py-0.5 shadow-[2px_2px_0_#1A1A1A] hover:bg-[#F2EFE9] transition-colors flex items-center gap-0.5"
                      >
                        <ChevronDown className="w-3 h-3" /> Demote
                      </button>
                    ) : (
                      <button
                        onClick={() => changeRole(u.email, "admin")}
                        title="Promote to Admin"
                        className="text-[11px] font-graffiti border-2 border-[#1A1A1A] bg-[#FF5A00] text-white px-2 py-0.5 shadow-[2px_2px_0_#1A1A1A] hover:bg-[#e65200] transition-colors flex items-center gap-0.5"
                      >
                        <ChevronUp className="w-3 h-3" /> Admin
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
