"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditBalance } from "@/lib/types";
import { Loader2, Download, Euro, ChevronDown, ChevronRight } from "lucide-react";

interface CreditDashboardProps {
  groupId: string;
  userEmail: string;
  isGroupAdmin: boolean;
  members: { userEmail: string; displayName?: string }[];
}

export default function CreditDashboard({
  groupId,
  userEmail,
  isGroupAdmin,
  members,
}: CreditDashboardProps) {
  const [balances, setBalances] = useState<CreditBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Admin payment form (supports recording one payment for many players at once)
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [payAmount, setPayAmount] = useState("");
  const [payDescription, setPayDescription] = useState("");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [recording, setRecording] = useState(false);
  const [showPayForm, setShowPayForm] = useState(false);

  const allSelected = members.length > 0 && selectedEmails.length === members.length;
  const toggleEmail = (email: string) =>
    setSelectedEmails((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  const toggleAll = () =>
    setSelectedEmails(allSelected ? [] : members.map((m) => m.userEmail));

  const fetchBalances = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/credits`);
      if (res.ok) {
        const data = await res.json();
        setBalances(data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch credits:", err);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedEmails.length === 0 || payAmount === "") return;
    setRecording(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userEmails: selectedEmails,
          amount: parseFloat(payAmount),
          description: payDescription || undefined,
          paymentDate: payDate || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to record payment");
        return;
      }
      setSelectedEmails([]);
      setPayAmount("");
      setPayDescription("");
      fetchBalances();
    } catch (err) {
      setError("Failed to record payment");
    } finally {
      setRecording(false);
    }
  };

  const exportCsv = (type: "balances" | "transactions" | "payments") => {
    window.open(`/api/groups/${groupId}/export?type=${type}`, "_blank");
  };

  const balanceColor = (balance: number) =>
    balance > 0 ? "text-[#0a8f3c]" : balance < 0 ? "text-[#FF5A00]" : "text-[#1A1A1A]";

  return (
    <div className="space-y-4">
      {/* Admin tools */}
      {isGroupAdmin && (
        <div className="marker-card p-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowPayForm((v) => !v)}
              className="flex items-center gap-1 font-graffiti text-xl text-[#1A1A1A] hover:text-[#FF5A00] transition-colors"
            >
              {showPayForm ? (
                <ChevronDown className="w-5 h-5" />
              ) : (
                <ChevronRight className="w-5 h-5" />
              )}
              Square Up
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => exportCsv("balances")}
                className="flex items-center gap-1 bg-[#1A1A1A] text-[#F2EFE9] px-3 py-1.5 border-2 border-[#1A1A1A] font-graffiti text-xs hover:bg-[#FF5A00] transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Balances
              </button>
              <button
                onClick={() => exportCsv("transactions")}
                className="flex items-center gap-1 bg-[#1A1A1A] text-[#F2EFE9] px-3 py-1.5 border-2 border-[#1A1A1A] font-graffiti text-xs hover:bg-[#FF5A00] transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Transactions
              </button>
              <button
                onClick={() => exportCsv("payments")}
                className="flex items-center gap-1 bg-[#1A1A1A] text-[#F2EFE9] px-3 py-1.5 border-2 border-[#1A1A1A] font-graffiti text-xs hover:bg-[#FF5A00] transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Payments
              </button>
            </div>
          </div>

          {showPayForm && (
          <form onSubmit={handleRecordPayment} className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-graffiti text-[#1A1A1A]">
                  Players {selectedEmails.length > 0 && `(${selectedEmails.length} selected)`}
                </label>
                {members.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-xs font-graffiti text-[#FF5A00] hover:underline"
                  >
                    {allSelected ? "Clear all" : "Select all"}
                  </button>
                )}
              </div>
              <div className="max-h-44 overflow-y-auto border-2 border-[#1A1A1A] bg-white divide-y divide-[#1A1A1A]/10">
                {members.length === 0 ? (
                  <p className="text-sm text-[#1A1A1A]/50 font-body p-3">No players yet</p>
                ) : (
                  members.map((m) => {
                    const checked = selectedEmails.includes(m.userEmail);
                    return (
                      <label
                        key={m.userEmail}
                        className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm font-body ${
                          checked ? "bg-[#96E600]/30" : "hover:bg-[#F2EFE9]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleEmail(m.userEmail)}
                          className="w-4 h-4 accent-[#FF5A00]"
                        />
                        {m.displayName || m.userEmail.split("@")[0]}
                      </label>
                    );
                  })
                )}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-graffiti text-[#1A1A1A]">Amount (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="sketch-input w-full text-sm"
                  placeholder="0.00"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-graffiti text-[#1A1A1A]">Date</label>
                <input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="sketch-input w-full text-sm"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-graffiti text-[#1A1A1A]">Note (optional)</label>
                <input
                  type="text"
                  value={payDescription}
                  onChange={(e) => setPayDescription(e.target.value)}
                  className="sketch-input w-full text-sm"
                  placeholder="e.g., season buy-in"
                />
              </div>
            </div>
            <p className="text-xs text-[#1A1A1A]/50 font-body">
              The same amount is recorded for every selected player — handy for a season buy-in.
            </p>
            <div>
              <button
                type="submit"
                disabled={recording || selectedEmails.length === 0 || payAmount === ""}
                className="sticker-btn flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {recording ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Euro className="w-4 h-4" />
                )}
                {selectedEmails.length > 1
                  ? `Record for ${selectedEmails.length} players`
                  : "Record Payment"}
              </button>
            </div>
          </form>
          )}

          {error && (
            <div className="p-2 bg-[#FF5A00]/10 border-2 border-[#FF5A00]">
              <p className="text-sm text-[#FF5A00] font-body">{error}</p>
            </div>
          )}
        </div>
      )}

      {/* Balances */}
      <div className="marker-card p-4">
        <h3 className="font-graffiti text-xl text-[#1A1A1A] mb-3">Balances</h3>
        <p className="text-xs text-[#1A1A1A]/50 font-body mb-3">
          Balance = paid − spots received + spots given up. Positive means credit available.
        </p>
        {loading ? (
          <div className="flex items-center gap-2 text-[#1A1A1A]/60 font-body py-6 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading balances…
          </div>
        ) : balances.length === 0 ? (
          <p className="text-center text-[#1A1A1A]/50 font-body py-6">No balances yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left font-graffiti text-[#1A1A1A]/70 border-b-2 border-[#1A1A1A]/20">
                  <th className="py-2 pr-2">Player</th>
                  <th className="py-2 px-2 text-right">Paid (€)</th>
                  <th className="py-2 px-2 text-right">Spent (€)</th>
                  <th className="py-2 px-2 text-right">Earned (€)</th>
                  <th className="py-2 pl-2 text-right">Balance (€)</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b) => (
                  <tr
                    key={b.userEmail}
                    className={`border-b border-[#1A1A1A]/10 ${
                      b.userEmail === userEmail ? "bg-[#96E600]/20" : ""
                    }`}
                  >
                    <td className="py-2 pr-2 font-marker">
                      {b.displayName || b.userEmail.split("@")[0]}
                      {b.userEmail === userEmail && (
                        <span className="text-[#1A1A1A]/50 ml-1 text-xs">(you)</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right font-body">€{b.totalPaid.toFixed(2)}</td>
                    <td className="py-2 px-2 text-right font-body">€{b.totalSpent.toFixed(2)}</td>
                    <td className="py-2 px-2 text-right font-body">€{b.totalEarned.toFixed(2)}</td>
                    <td className={`py-2 pl-2 text-right font-graffiti ${balanceColor(b.balance)}`}>
                      €{b.balance.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
