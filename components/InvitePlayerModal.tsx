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
import { Loader2, Mail, Check, Clock, Crown, ShieldCheck, ChevronUp, ChevronDown, Pencil, X, Trash2 } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

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

interface RemovalWarnings {
  confirmedSpotCount: number;
  spotBreakdown: { crewName: string; count: number }[];
  balances: { crewName: string; balance: number }[];
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
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editEmailValue, setEditEmailValue] = useState("");
  const [emailUpdating, setEmailUpdating] = useState<string | null>(null);
  const [buffTarget, setBuffTarget] = useState<InviteUser | null>(null);
  const [buffWarnings, setBuffWarnings] = useState<RemovalWarnings | null>(null);
  const [buffLoading, setBuffLoading] = useState(false);
  const [buffRemoving, setBuffRemoving] = useState(false);
  const [buffError, setBuffError] = useState<string | null>(null);

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

  const startEditEmail = (userEmail: string) => {
    setEditingEmail(userEmail);
    setEditEmailValue(userEmail);
    setError(null);
    setSuccess(null);
  };

  const cancelEditEmail = () => {
    setEditingEmail(null);
    setEditEmailValue("");
  };

  const saveEmail = async (oldEmail: string) => {
    const newEmail = editEmailValue.trim().toLowerCase();
    if (!newEmail || newEmail === oldEmail) {
      cancelEditEmail();
      return;
    }
    setEmailUpdating(oldEmail);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/invite", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldEmail, newEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update email");
        return;
      }
      setSuccess(data.message || "Email updated");
      cancelEditEmail();
      fetchUsers();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setEmailUpdating(null);
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

  const buildBuffMessage = (target: InviteUser, warnings: RemovalWarnings | null) => {
    if (buffError) return buffError;

    const name = target.onboarded ? target.displayName : target.email;
    const lines = [
      `Buff ${name} from the Black Book? They won't be able to sign in. Crew memberships go inactive; ledger and game history stay on the books.`,
    ];

    if (warnings) {
      if (warnings.confirmedSpotCount > 0) {
        const breakdown = warnings.spotBreakdown
          .map((s) => `${s.crewName}: ${s.count}`)
          .join(", ");
        lines.push(
          `Warning: ${warnings.confirmedSpotCount} confirmed spot(s) in upcoming games (${breakdown}).`
        );
      }
      for (const b of warnings.balances) {
        const label = b.balance < 0 ? "owes" : "credit";
        lines.push(
          `Warning: Non-zero balance in ${b.crewName} — ${label} $${Math.abs(b.balance).toFixed(2)}.`
        );
      }
    }

    return lines.join("\n\n");
  };

  const startBuff = async (target: InviteUser) => {
    setBuffTarget(target);
    setBuffWarnings(null);
    setBuffError(null);
    setBuffLoading(true);
    try {
      const res = await fetch(
        `/api/admin/users/removal-warnings?email=${encodeURIComponent(target.email)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBuffError(data.error || "Failed to load removal warnings");
        return;
      }
      setBuffWarnings(data.data?.warnings ?? null);
    } catch {
      setBuffError("Failed to load removal warnings");
    } finally {
      setBuffLoading(false);
    }
  };

  const handleBuff = async () => {
    if (!buffTarget) return;
    setBuffRemoving(true);
    setBuffError(null);
    try {
      const res = await fetch("/api/admin/invite", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: buffTarget.email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBuffError(data.error || "Failed to remove player");
        return;
      }
      setSuccess(data.message || "Player buffed from the Black Book");
      setBuffTarget(null);
      setBuffWarnings(null);
      fetchUsers();
    } catch {
      setBuffError("An unexpected error occurred");
    } finally {
      setBuffRemoving(false);
    }
  };

  const closeBuffDialog = () => {
    setBuffTarget(null);
    setBuffWarnings(null);
    setBuffError(null);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="graffiti-dialog max-w-md max-h-[85vh] overflow-y-auto mx-2 sm:mx-auto rounded-none shadow-sticker-lg">
        <DialogHeader>
          <DialogTitle className="graffiti-dialog-title">The Black Book</DialogTitle>
          <DialogDescription className="font-body text-asphalt/70">
            Every writer in the book. Only names you put down here can get on. Drop an email to
            put someone on the list — they tag their own handle the first time they sign in.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleInvite} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="invite-email" className="font-graffiti text-asphalt">
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
                Put On
              </button>
            </div>
          </div>

          {error && (
            <div className="p-2 bg-terracotta/10 border-2 border-terracotta">
              <p className="text-sm text-terracotta font-body">{error}</p>
            </div>
          )}
          {success && (
            <div className="p-2 bg-moss-green/20 border-2 border-asphalt">
              <p className="text-sm text-asphalt font-body">{success}</p>
            </div>
          )}
        </form>

        <div className="space-y-2">
          <h3 className="font-graffiti text-lg text-asphalt">On The Wall ({users.length})</h3>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {users.map((u) => (
              <div
                key={u.email}
                className="flex items-center justify-between gap-2 bg-white border-2 border-asphalt px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-marker text-sm text-asphalt truncate flex items-center gap-1">
                    {u.onboarded ? u.displayName : u.email.split("@")[0]}
                    {u.globalRole === "owner" && (
                      <span className="text-[10px] text-terracotta font-graffiti flex items-center gap-0.5">
                        <Crown className="w-3 h-3" /> OWNER
                      </span>
                    )}
                    {u.globalRole === "admin" && (
                      <span className="text-[10px] text-terracotta font-graffiti flex items-center gap-0.5">
                        <ShieldCheck className="w-3 h-3" /> ADMIN
                      </span>
                    )}
                  </p>
                  {editingEmail === u.email ? (
                    <div className="flex items-center gap-1 mt-1">
                      <Input
                        type="email"
                        value={editEmailValue}
                        onChange={(e) => setEditEmailValue(e.target.value)}
                        className="sketch-input h-6 text-xs py-0 px-1 flex-1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEmail(u.email);
                          if (e.key === "Escape") cancelEditEmail();
                        }}
                      />
                      <button
                        onClick={() => saveEmail(u.email)}
                        disabled={emailUpdating === u.email}
                        className="text-[10px] font-graffiti border border-asphalt bg-moss-green text-asphalt px-1.5 py-0.5 shadow-sticker-sm hover:bg-[#6aaa64] transition-colors"
                      >
                        {emailUpdating === u.email ? <Loader2 className="w-3 h-3 animate-spin" /> : "OK"}
                      </button>
                      <button onClick={cancelEditEmail} className="text-asphalt/50 hover:text-asphalt">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <span className="flex items-center gap-1 group">
                      <span className="text-xs text-asphalt/50 font-body truncate">{u.email}</span>
                      <button
                        onClick={() => startEditEmail(u.email)}
                        title="Change email"
                        className="opacity-0 group-hover:opacity-100 text-asphalt/40 hover:text-asphalt transition-opacity"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {u.onboarded ? (
                    <span className="hidden sm:flex items-center gap-1 text-success font-graffiti text-xs whitespace-nowrap">
                      <Check className="w-3.5 h-3.5" /> active
                    </span>
                  ) : (
                    <span className="hidden sm:flex items-center gap-1 text-asphalt/50 font-graffiti text-xs whitespace-nowrap">
                      <Clock className="w-3.5 h-3.5" /> invited
                    </span>
                  )}
                  {/* Role controls — Owner is protected; can't change own role here. */}
                  {u.globalRole !== "owner" &&
                    u.email.toLowerCase() !== (currentUserEmail ?? "").toLowerCase() &&
                    (roleUpdating === u.email ? (
                      <Loader2 className="w-4 h-4 animate-spin text-asphalt/60" />
                    ) : u.globalRole === "admin" ? (
                      <button
                        onClick={() => changeRole(u.email, "user")}
                        title="Demote to Player"
                        className="text-[11px] font-graffiti border-2 border-asphalt bg-white px-2 py-0.5 shadow-sticker-sm hover:bg-sticker-white transition-colors flex items-center gap-0.5"
                      >
                        <ChevronDown className="w-3 h-3" /> Demote
                      </button>
                    ) : (
                      <button
                        onClick={() => changeRole(u.email, "admin")}
                        title="Promote to Admin"
                        className="text-[11px] font-graffiti border-2 border-asphalt bg-terracotta text-white px-2 py-0.5 shadow-sticker-sm hover:bg-[#e65200] transition-colors flex items-center gap-0.5"
                      >
                        <ChevronUp className="w-3 h-3" /> Admin
                      </button>
                    ))}
                  {u.globalRole !== "owner" &&
                    u.email.toLowerCase() !== (currentUserEmail ?? "").toLowerCase() &&
                    (buffLoading && buffTarget?.email === u.email ? (
                      <Loader2 className="w-4 h-4 animate-spin text-asphalt/60" />
                    ) : (
                      <button
                        onClick={() => startBuff(u)}
                        title="Buff from Black Book"
                        className="text-terracotta hover:text-terracotta/70 transition-colors"
                        aria-label={`Buff ${u.displayName || u.email}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>

      <ConfirmDialog
        open={!!buffTarget}
        onOpenChange={(open) => {
          if (!open) closeBuffDialog();
        }}
        title="Buff 'Em?"
        message={
          buffLoading
            ? "Checking crews for upcoming spots and open balances…"
            : buffTarget
              ? buildBuffMessage(buffTarget, buffWarnings)
              : ""
        }
        confirmLabel={buffError ? "OK" : "BUFF EM"}
        cancelLabel="Nevermind"
        onConfirm={
          buffError
            ? closeBuffDialog
            : buffLoading
              ? closeBuffDialog
              : handleBuff
        }
        loading={buffRemoving}
      />
    </>
  );
}
